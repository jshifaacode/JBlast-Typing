var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null, pid = null, isHost = false;
  var players = {};
  var cbs = {};
  var _poll = null;
  var POLL_MS = 300;
  var PLAYER_MAX_HP = 200, MAX_PLAYERS = 4, MIN_PLAYERS = 2;

  var _gameStarted = false;
  var _gameEnded = false;
  var _isMatchEnded = false;
  var _winnerId = null;
  var _lastGameOver = "";
  var _lastRematchSig = "";
  var _lastVoteSnap = "";
  var _lastPlayerSnap = "";
  var _processedEvents = {};
  var _doingRematch = false;
  var _gameOverEmitted = false;
  var _rematchVotes = {};
  var _lastHpSnapshot = {};
  var _debugLog = [];
  var _heartbeatTimer = null;
  var _lastPollAt = 0;
  var _gameOverBroadcastLock = false;
  var _eliminationProcessed = {};

  // HP seq per player: only accept writes with higher seq
  var _hpWriteSeq = {};
  var _myHpSeq = 0;

  // Damage queue: non-host sends damage requests; host processes them
  var _pendingDamage = {}; // { [oppId]: totalDmg }

  function _log(msg) {
    var entry = "[MP " + new Date().toISOString().substr(11, 12) + "] " + msg;
    _debugLog.push(entry);
    if (_debugLog.length > 300) _debugLog.shift();
    console.log(entry);
  }

  function genCode() {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = "";
    for (var i = 0; i < 5; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
  }

  function genId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function on(ev, cb) { cbs[ev] = cb; }

  function emit(ev, d) {
    if (cbs[ev]) try { cbs[ev](d); } catch (x) { _log("emit error " + ev + ": " + x); }
  }

  function _req(path, method, body) {
    var url = FIREBASE_URL + "/" + path + ".json";
    var opts = { method: method || "GET", cache: "no-store" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) { return r.json(); }).catch(function (e) {
      _log("req error " + path + ": " + e);
      return null;
    });
  }

  function dbGet(p) { return _req(p); }
  function dbSet(p, d) { return _req(p, "PUT", d); }
  function dbUpd(p, d) { return _req(p, "PATCH", d); }
  function dbDel(p) {
    return fetch(FIREBASE_URL + "/" + p + ".json", { method: "DELETE" }).catch(function () {});
  }

  function _resetRound() {
    _gameStarted = false;
    _gameEnded = false;
    _isMatchEnded = false;
    _winnerId = null;
    _lastGameOver = "";
    _lastRematchSig = "";
    _lastVoteSnap = "";
    _lastPlayerSnap = "";
    _processedEvents = {};
    _doingRematch = false;
    _gameOverEmitted = false;
    _rematchVotes = {};
    _lastHpSnapshot = {};
    _gameOverBroadcastLock = false;
    _eliminationProcessed = {};
    _hpWriteSeq = {};
    _myHpSeq = 0;
    _pendingDamage = {};
    _log("Round reset");
  }

  function stopPoll() {
    if (_poll) { clearInterval(_poll); _poll = null; }
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  function _getAlivePlayers(fp) {
    return Object.values(fp || players).filter(function (p) {
      return (p.hp || 0) > 0 && !p.eliminated && p.id !== undefined;
    });
  }

  function _renderAvatar(av) {
    var map = {
      BOLT: '<i class="fa-solid fa-bolt"></i>',
      SKULL: '<i class="fa-solid fa-skull"></i>',
      FIRE: '<i class="fa-solid fa-fire"></i>',
      ALIEN: '<i class="fa-solid fa-user-secret"></i>',
      ROBOT: '<i class="fa-solid fa-robot"></i>',
      SHIELD: '<i class="fa-solid fa-shield-halved"></i>',
      DNA: '<i class="fa-solid fa-dna"></i>',
      BURST: '<i class="fa-solid fa-burst"></i>',
      SATELLITE: '<i class="fa-solid fa-satellite"></i>',
      GEM: '<i class="fa-solid fa-gem"></i>',
      TORNADO: '<i class="fa-solid fa-tornado"></i>',
      SWORD: '<i class="fa-solid fa-khanda"></i>',
    };
    return map[av] || '<i class="fa-solid fa-user-astronaut"></i>';
  }

  function _entry(p) {
    return {
      id: p.id, name: p.name, avatar: p.avatar,
      hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
      wpm: 0, progress: 0, ready: true, online: true,
      eliminated: false, lastSeen: Date.now(),
    };
  }

  function _updateLobbyUI() {
    var list = Object.values(players);
    var grid = document.getElementById("lobbyPlayers");
    if (grid) {
      grid.innerHTML = list.map(function (p) {
        var isMe = p.id === pid;
        return '<div class="lpc ready">' +
          '<div class="lpc-avatar">' + _renderAvatar(p.avatar) + "</div>" +
          '<div class="lpc-name bb">' + p.name + (isMe ? " (YOU)" : "") + "</div>" +
          '<div class="lpc-status" style="color:var(--g)">READY</div></div>';
      }).join("");
    }
    var st = document.getElementById("lobbyStatus");
    if (st) st.textContent = list.length + "/" + MAX_PLAYERS + " PILOT(S) IN LOBBY";
    var btn = document.getElementById("btnStartMatch");
    if (btn) {
      if (isHost) {
        btn.style.display = "block";
        var ok = list.length >= MIN_PLAYERS;
        btn.disabled = !ok;
        btn.style.opacity = ok ? "1" : "0.4";
        btn.style.pointerEvents = ok ? "auto" : "none";
      } else {
        btn.style.display = "none";
      }
    }
  }

  // HOST ONLY: determine winner and broadcast game over
  function _checkAndBroadcastWinner(fp) {
    if (!isHost || !room || _isMatchEnded || _gameOverBroadcastLock) return;
    var allP = Object.values(fp || players);
    if (allP.length < MIN_PLAYERS) return;
    var alive = _getAlivePlayers(fp);
    _log("Host check winner: " + alive.length + " alive of " + allP.length);
    if (alive.length <= 1) {
      _gameOverBroadcastLock = true;
      _isMatchEnded = true;
      _gameEnded = true;
      _winnerId = alive.length === 1 ? alive[0].id : null;
      var val = _winnerId || "none";
      _lastGameOver = val;
      _log("Winner: " + val);
      dbUpd("rooms/" + room, {
        gameOver: val, status: "ended", endedAt: Date.now()
      });
    }
  }

  function _startHeartbeat(code) {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(function () {
      if (!room || !pid) return;
      dbUpd("rooms/" + code + "/players/" + pid, { lastSeen: Date.now() });
    }, 8000);
  }

  // HOST: apply pending damage from non-host players
  function _processPendingDamage() {
    if (!isHost || _isMatchEnded) return;
    var keys = Object.keys(_pendingDamage);
    if (keys.length === 0) return;
    var batch = _pendingDamage;
    _pendingDamage = {};
    keys.forEach(function (targetId) {
      var dmg = batch[targetId];
      if (!dmg || dmg <= 0) return;
      var p = players[targetId];
      if (!p || p.eliminated || (p.hp || 0) <= 0) return;
      var newHp = Math.max(0, (p.hp || 0) - dmg);
      _log("Host applying queued dmg " + dmg + " to " + targetId + " new hp=" + newHp);
      pushHp(targetId, newHp);
    });
  }

  function startPoll(code) {
    stopPoll();
    _lastPollAt = Date.now();
    _poll = setInterval(function () {
      _lastPollAt = Date.now();
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;

        // --- Process events first ---
        var evs = r.events || {};
        var now = Date.now();
        Object.keys(evs).forEach(function (k) {
          var ev = evs[k];
          if (!ev || !ev.ts) return;
          if (now - ev.ts > 10000) return;
          if (_processedEvents[k]) return;
          _processedEvents[k] = true;

          if (ev.type === "typing" && ev.from !== pid) {
            emit("player_typing", { playerId: ev.from, name: ev.name });
          }

          // Non-host sends damage request; host applies it
          if (ev.type === "damage_request" && isHost && ev.target && ev.from !== pid) {
            var amount = ev.amount || 0;
            if (amount > 0 && !_isMatchEnded) {
              _pendingDamage[ev.target] = (_pendingDamage[ev.target] || 0) + amount;
            }
          }

          if (ev.type === "eliminate" && ev.target) {
            var eTarget = ev.target;
            if (players[eTarget]) {
              players[eTarget].hp = 0;
              players[eTarget].eliminated = true;
            }
            if (!_eliminationProcessed[eTarget]) {
              _eliminationProcessed[eTarget] = true;
              _log("Eliminate event: " + eTarget);
              emit("player_eliminated", { playerId: eTarget });
            }
            if (isHost && !_isMatchEnded && !_gameOverBroadcastLock) {
              dbGet("rooms/" + room + "/players").then(function (freshFp) {
                if (!freshFp || _isMatchEnded || _gameOverBroadcastLock) return;
                // Merge local knowledge
                Object.keys(players).forEach(function (id) {
                  if (players[id] && freshFp[id]) {
                    if (players[id].eliminated) freshFp[id].eliminated = true;
                    if ((players[id].hp || 0) < (freshFp[id].hp || 0))
                      freshFp[id].hp = players[id].hp;
                  }
                });
                players = freshFp;
                _checkAndBroadcastWinner(freshFp);
              });
            }
          }
        });

        // Process pending damage (host only)
        if (isHost) _processPendingDamage();

        // --- Player data ---
        var fp = r.players || {};
        var snap = JSON.stringify(fp);
        if (snap !== _lastPlayerSnap) {
          _lastPlayerSnap = snap;

          // Merge: for my own player, trust local HP (authoritative)
          // For others, trust remote
          var mergedPlayers = {};
          Object.keys(fp).forEach(function (id) {
            var remote = fp[id];
            var local = players[id];
            if (id === pid && local && _myHpSeq > 0) {
              mergedPlayers[id] = Object.assign({}, remote, {
                hp: local.hp,
                eliminated: local.eliminated,
              });
            } else {
              mergedPlayers[id] = remote;
            }
          });
          players = mergedPlayers;

          if (!_gameStarted) {
            emit("players_update", { players: Object.values(players) });
            _updateLobbyUI();
          } else if (!_isMatchEnded) {
            emit("players_update", { players: Object.values(players) });
            emit("hp_sync", { players: Object.values(players) });
            if (isHost) _checkAndBroadcastWinner(mergedPlayers);
          }
        }

        var status = r.status || "lobby";
        if (status === "playing" && !_gameStarted) {
          _gameStarted = true;
          _gameEnded = false;
          _isMatchEnded = false;
          _gameOverEmitted = false;
          _gameOverBroadcastLock = false;
          _processedEvents = {};
          _eliminationProcessed = {};
          _lastVoteSnap = "";
          _log("Game started, word: " + (r.currentWord || ""));
          emit("game_start", { word: r.currentWord || "", players: Object.values(players) });
        }

        // Rematch
        var rSig = (r.rematchWord || "") + "|" + (r.rematchStartedAt || 0);
        if (r.rematchWord && r.rematchWord !== "" && rSig !== _lastRematchSig && _gameStarted) {
          _lastRematchSig = rSig;
          _gameEnded = false;
          _isMatchEnded = false;
          _gameOverEmitted = false;
          _gameOverBroadcastLock = false;
          _lastGameOver = "";
          _processedEvents = {};
          _eliminationProcessed = {};
          _lastVoteSnap = "";
          _doingRematch = false;
          _rematchVotes = {};
          _hpWriteSeq = {};
          _myHpSeq = 0;
          _pendingDamage = {};
          _log("Rematch start, word: " + r.rematchWord);
          emit("rematch_start", { word: r.rematchWord, players: Object.values(players) });
        }

        // Game over
        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver && !_gameOverEmitted) {
          _lastGameOver = goVal;
          _gameEnded = true;
          _isMatchEnded = true;
          _gameOverEmitted = true;
          _gameOverBroadcastLock = true;
          _winnerId = goVal === "none" ? null : goVal;
          // Use freshest player data from Firebase
          var goPl = r.players ? Object.values(r.players) : Object.values(players);
          _log("Game over: winner=" + goVal + " players=" + goPl.length);
          emit("game_over", { winnerId: _winnerId, players: goPl, isMatchEnded: true });
        }

        // Rematch votes
        var rv = r.rematchVotes || {};
        var vSnap = JSON.stringify(rv);
        if (vSnap !== _lastVoteSnap) {
          _lastVoteSnap = vSnap;
          _rematchVotes = rv;
          var pIds = Object.keys(players);
          if (pIds.length >= MIN_PLAYERS) _handleRematchVotes(rv, pIds);
        }

        // Timer end flag
        if (r.timerEnd && r.timerEnd > 0 && isHost && !_isMatchEnded && !_gameOverBroadcastLock) {
          _log("Host sees timerEnd, resolving winner");
          _handleTimerEndAsHost(r.players || players);
        }
      });
    }, POLL_MS);

    _startHeartbeat(code);
  }

  function _handleTimerEndAsHost(fp) {
    if (_isMatchEnded || _gameOverBroadcastLock) return;
    _gameOverBroadcastLock = true;
    _isMatchEnded = true;
    var allP = Object.values(fp);
    var sorted = allP.slice().sort(function (a, b) { return (b.hp || 0) - (a.hp || 0); });
    var winnerId = sorted[0] ? sorted[0].id : null;
    var val = winnerId || "none";
    _lastGameOver = val;
    _log("Timer end winner: " + val);
    dbUpd("rooms/" + room, { gameOver: val, status: "ended", endedAt: Date.now(), timerEnd: 0 });
  }

  function _handleRematchVotes(votes, pIds) {
    var totalAccept = pIds.filter(function (k) { return votes[k] === true; }).length;
    var hasDecline = pIds.some(function (k) { return votes[k] === false; });
    emit("rematch_votes_update", {
      votes: totalAccept, total: pIds.length,
      voteMap: votes, hasDecline: hasDecline
    });
    if (!hasDecline && isHost && totalAccept >= pIds.length && !_doingRematch) {
      _doingRematch = true;
      _log("All accepted, starting rematch");
      dbUpd("rooms/" + room, { rematchVotes: null }).then(function () { startRematch(); });
    }
  }

  function _setupBeforeUnload(code) {
    window.addEventListener("beforeunload", function () {
      try {
        navigator.sendBeacon(FIREBASE_URL + "/rooms/" + code + "/players/" + pid + "/hp.json", JSON.stringify(0));
        navigator.sendBeacon(FIREBASE_URL + "/rooms/" + code + "/players/" + pid + "/eliminated.json", JSON.stringify(true));
      } catch (x) {}
    });
  }

  function createRoom(p) {
    p.id = p.id || genId();
    pid = p.id;
    isHost = true;
    _resetRound();
    var code = genCode();
    room = code;
    var data = {
      code: code, host: pid, status: "lobby", createdAt: Date.now(),
      currentWord: "", rematchWord: "", rematchStartedAt: 0,
      gameOver: "", events: {}, rematchVotes: {}, players: {}, timerEnd: 0,
    };
    data.players[pid] = _entry(p);
    return dbSet("rooms/" + code, data).then(function () {
      players = {};
      players[pid] = _entry(p);
      startPoll(code);
      _setupBeforeUnload(code);
      _log("Room created: " + code);
      return { roomCode: code, players: Object.values(players) };
    });
  }

  function joinRoom(code, p) {
    code = code.toUpperCase();
    return dbGet("rooms/" + code).then(function (r) {
      if (!r) { Effects.showToast("ROOM TIDAK DITEMUKAN!", "error"); return null; }
      if (r.status === "playing" || r.status === "ended") {
        Effects.showToast("GAME SEDANG BERLANGSUNG!", "error"); return null;
      }
      var cnt = r.players ? Object.keys(r.players).length : 0;
      if (cnt >= MAX_PLAYERS) {
        Effects.showToast("ROOM PENUH! (MAKS " + MAX_PLAYERS + ")", "error"); return null;
      }
      p.id = p.id || genId();
      pid = p.id;
      isHost = false;
      room = code;
      _resetRound();
      return dbSet("rooms/" + code + "/players/" + pid, _entry(p))
        .then(function () { return dbGet("rooms/" + code + "/players"); })
        .then(function (all) {
          players = all || {};
          startPoll(code);
          _setupBeforeUnload(code);
          _log("Joined room: " + code);
          return { roomCode: code, players: Object.values(players) };
        });
    });
  }

  function startGame() {
    if (!isHost || !room) return Promise.resolve();
    var list = Object.values(players);
    if (list.length < MIN_PLAYERS) {
      Effects.showToast("Butuh minimal " + MIN_PLAYERS + " pemain!", "error");
      return Promise.resolve();
    }
    _resetRound();
    var word = Words.getEasy();
    var updates = {
      status: "playing", currentWord: word, rematchWord: "", rematchStartedAt: 0,
      gameOver: "", rematchVotes: null, startedAt: Date.now(),
      events: {}, endedAt: 0, timerEnd: 0,
    };
    list.forEach(function (p) {
      updates["players/" + p.id + "/hp"] = PLAYER_MAX_HP;
      updates["players/" + p.id + "/wpm"] = 0;
      updates["players/" + p.id + "/progress"] = 0;
      updates["players/" + p.id + "/eliminated"] = false;
      updates["players/" + p.id + "/lastSeen"] = Date.now();
      if (players[p.id]) {
        players[p.id].hp = PLAYER_MAX_HP;
        players[p.id].wpm = 0;
        players[p.id].progress = 0;
        players[p.id].eliminated = false;
      }
    });
    _log("Starting game, word: " + word);
    return dbUpd("rooms/" + room, updates);
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    _pendingDamage = {};
    var word = Words.getEasy();
    var ts = Date.now();
    return dbGet("rooms/" + room + "/players").then(function (fp) {
      var allP = fp || players;
      var updates = {
        status: "playing", currentWord: word, rematchWord: word,
        rematchStartedAt: ts, gameOver: "", rematchVotes: null,
        startedAt: ts, events: {}, endedAt: 0, timerEnd: 0,
      };
      Object.keys(allP).forEach(function (id) {
        updates["players/" + id + "/hp"] = PLAYER_MAX_HP;
        updates["players/" + id + "/wpm"] = 0;
        updates["players/" + id + "/progress"] = 0;
        updates["players/" + id + "/eliminated"] = false;
        updates["players/" + id + "/lastSeen"] = ts;
        if (players[id]) {
          players[id].hp = PLAYER_MAX_HP;
          players[id].wpm = 0;
          players[id].progress = 0;
          players[id].eliminated = false;
        }
      });
      _lastRematchSig = word + "|" + ts;
      _doingRematch = false;
      _rematchVotes = {};
      _log("Rematch started, word: " + word);
      return dbUpd("rooms/" + room, updates);
    });
  }

  function voteRematch(accept) {
    if (!room || !pid) return Promise.resolve();
    _log("Vote rematch: " + (accept ? "accept" : "decline"));
    return dbSet("rooms/" + room + "/rematchVotes/" + pid, accept === false ? false : true);
  }

  // Push my own HP to Firebase (authoritative)
  function pushMyHp(hp) {
    if (!room || !pid) return Promise.resolve();
    var safe = Math.max(0, Math.min(PLAYER_MAX_HP, Math.ceil(hp)));
    _myHpSeq++;
    if (players[pid]) { players[pid].hp = safe; players[pid].eliminated = safe <= 0; }
    _lastHpSnapshot[pid] = safe;
    _log("Push my HP: " + safe);
    var updates = { hp: safe, eliminated: safe <= 0 };
    return dbUpd("rooms/" + room + "/players/" + pid, updates).then(function () {
      if (safe === 0 && !_isMatchEnded) {
        var eKey = Date.now().toString(36) + "_e";
        return dbSet("rooms/" + room + "/events/" + eKey, {
          type: "eliminate", target: pid, from: pid, ts: Date.now()
        }).then(function () {
          if (isHost) {
            return dbGet("rooms/" + room + "/players").then(function (freshFp) {
              if (!freshFp) return;
              players = Object.assign({}, players, freshFp);
              if (players[pid]) { players[pid].hp = 0; players[pid].eliminated = true; }
              _checkAndBroadcastWinner(players);
            });
          }
        });
      }
    });
  }

  // HOST ONLY: push HP of another player
  function pushHp(targetId, hp) {
    if (!room || !pid || _isMatchEnded || !isHost) return Promise.resolve();
    var safe = Math.max(0, Math.min(PLAYER_MAX_HP, Math.ceil(hp)));
    if (players[targetId]) { players[targetId].hp = safe; }
    _lastHpSnapshot[targetId] = safe;
    return dbUpd("rooms/" + room + "/players/" + targetId, { hp: safe, eliminated: safe <= 0 });
  }

  // Called by host to damage opponent
  function pushOpponentHp(oppId, hp) {
    if (!isHost) return Promise.resolve();
    return pushHp(oppId, hp).then(function () {
      if (hp <= 0 && !_isMatchEnded) {
        if (players[oppId]) players[oppId].eliminated = true;
        var eKey = Date.now().toString(36) + "_e";
        return dbSet("rooms/" + room + "/events/" + eKey, {
          type: "eliminate", target: oppId, from: pid, ts: Date.now()
        }).then(function () {
          return dbGet("rooms/" + room + "/players").then(function (freshFp) {
            if (!freshFp) return;
            players = Object.assign({}, players, freshFp);
            if (players[oppId]) { players[oppId].hp = 0; players[oppId].eliminated = true; }
            _checkAndBroadcastWinner(players);
          });
        });
      }
    });
  }

  // NON-HOST: send damage request via event (host will apply it)
  function sendDamageRequest(targetId, amount) {
    if (!room || !pid || isHost || _isMatchEnded) return Promise.resolve();
    var eKey = Date.now().toString(36) + "_dmg_" + Math.random().toString(36).substr(2, 4);
    return dbSet("rooms/" + room + "/events/" + eKey, {
      type: "damage_request", target: targetId, from: pid, amount: amount, ts: Date.now()
    });
  }

  function pushMyProgress(progress, wpm) {
    if (!room || !pid) return Promise.resolve();
    if (players[pid]) { players[pid].progress = progress; players[pid].wpm = wpm; }
    return dbUpd("rooms/" + room + "/players/" + pid, { progress: progress, wpm: wpm });
  }

  function sendTyping() {
    if (!room || !pid) return Promise.resolve();
    var id = Date.now().toString(36) + "_t";
    return dbSet("rooms/" + room + "/events/" + id, {
      type: "typing", from: pid, name: (players[pid] && players[pid].name) || "?", ts: Date.now()
    });
  }

  function broadcastTimerEnd(currentPlayers) {
    if (!room || _isMatchEnded || _gameOverBroadcastLock) return Promise.resolve();
    _log("Broadcasting timer end");
    var updates = { timerEnd: Date.now() };
    if (isHost) {
      var allP = currentPlayers || Object.values(players);
      var sorted = allP.slice().sort(function (a, b) { return (b.hp || 0) - (a.hp || 0); });
      var winnerId = sorted[0] ? sorted[0].id : null;
      var val = winnerId || "none";
      _gameOverBroadcastLock = true;
      _isMatchEnded = true;
      _lastGameOver = val;
      updates.gameOver = val;
      updates.status = "ended";
      updates.endedAt = Date.now();
      _log("Host timer end winner: " + val);
    }
    return dbUpd("rooms/" + room, updates);
  }

  function broadcastGameOver(winnerId) {
    if (!room || _isMatchEnded || _gameOverBroadcastLock) return Promise.resolve();
    _isMatchEnded = true;
    _gameEnded = true;
    _gameOverBroadcastLock = true;
    _winnerId = winnerId;
    var val = winnerId || "none";
    _lastGameOver = val;
    _log("Broadcasting game over: " + val);
    return dbUpd("rooms/" + room, { gameOver: val, status: "ended", endedAt: Date.now() });
  }

  function trySubmitAnswer(token) {
    if (!room || !pid || _isMatchEnded) return Promise.resolve(false);
    // Use Firebase to claim the answer token atomically
    var lockPath = "rooms/" + room + "/answerLock/" + token;
    return dbGet(lockPath).then(function (existing) {
      if (existing !== null && existing !== undefined) {
        _log("Token already claimed");
        return false;
      }
      return dbSet(lockPath, { by: pid, ts: Date.now() }).then(function () {
        return dbGet(lockPath);
      }).then(function (val) {
        if (!val || val.by !== pid) {
          _log("Race lost for token");
          return false;
        }
        _log("Answer token claimed: " + token);
        return true;
      });
    }).catch(function () { return false; });
  }

  function leaveRoom() {
    stopPoll();
    var r = room, p = pid, host = isHost;
    room = null; pid = null; isHost = false; players = {};
    _resetRound();
    if (r && p) {
      dbDel("rooms/" + r + "/players/" + p);
      if (host) dbDel("rooms/" + r);
    }
    return Promise.resolve();
  }

  function getPlayers() { return Object.values(players); }
  function getPlayer() { return players[pid]; }
  function getCurrentRoom() { return room; }
  function getIsHost() { return isHost; }
  function getPlayerId() { return pid; }
  function generatePlayerId() { return genId(); }
  function getMinPlayers() { return MIN_PLAYERS; }
  function getMaxPlayers() { return MAX_PLAYERS; }
  function getRenderAvatar() { return _renderAvatar; }
  function getPlayerMaxHp() { return PLAYER_MAX_HP; }
  function isMatchEndedFn() { return _isMatchEnded; }
  function getWinnerId() { return _winnerId; }
  function getAlivePlayers() { return _getAlivePlayers(players); }
  function getDebugLog() { return _debugLog.slice(); }

  return {
    on, generatePlayerId, createRoom, joinRoom, startGame, startRematch, voteRematch,
    trySubmitAnswer, pushMyHp, pushMyProgress, pushHp, pushOpponentHp, sendDamageRequest,
    broadcastTimerEnd, broadcastGameOver, sendTyping, leaveRoom,
    getPlayers, getPlayer, getCurrentRoom, getIsHost, getPlayerId,
    getMinPlayers, getMaxPlayers, getRenderAvatar, getPlayerMaxHp,
    isMatchEnded: isMatchEndedFn, getWinnerId, getAlivePlayers, getDebugLog,
  };
})();