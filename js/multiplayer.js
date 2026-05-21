var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null,
    pid = null,
    isHost = false;
  var players = {};
  var cbs = {};
  var _poll = null;
  var POLL_MS = 200;
  var PLAYER_MAX_HP = 200,
    MAX_PLAYERS = 4,
    MIN_PLAYERS = 2;

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
  var _lastAnswerToken = "";
  var _answerLock = false;
  var _answerDebounceTimer = null;
  var _gameOverEmitted = false;
  var _rematchVotes = {};
  var _lastHpSnapshot = {};
  var _debugLog = [];
  var _serverTimeOffset = 0;
  var _heartbeatTimer = null;
  var _reconnectTimer = null;
  var _lastPollAt = 0;
  var _gameOverBroadcastLock = false;
  var _eliminationProcessed = {};
  var _hpWriteSeq = {};
  var _myHpSeq = 0;

  function _log(msg) {
    var entry = "[MP " + new Date().toISOString().substr(11, 12) + "] " + msg;
    _debugLog.push(entry);
    if (_debugLog.length > 300) _debugLog.shift();
    console.log(entry);
  }

  function genCode() {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
      r = "";
    for (var i = 0; i < 5; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
  }

  function genId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function on(ev, cb) {
    cbs[ev] = cb;
  }

  function emit(ev, d) {
    if (cbs[ev])
      try {
        cbs[ev](d);
      } catch (x) {
        _log("emit error " + ev + ": " + x);
      }
  }

  function _req(path, method, body) {
    var url = FIREBASE_URL + "/" + path + ".json";
    var opts = { method: method || "GET", cache: "no-store" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts)
      .then(function (r) {
        return r.json();
      })
      .catch(function (e) {
        _log("req error " + path + ": " + e);
        return null;
      });
  }

  function dbGet(p) {
    return _req(p);
  }
  function dbSet(p, d) {
    return _req(p, "PUT", d);
  }
  function dbUpd(p, d) {
    return _req(p, "PATCH", d);
  }
  function dbDel(p) {
    return fetch(FIREBASE_URL + "/" + p + ".json", { method: "DELETE" }).catch(
      function () {},
    );
  }

  function _syncServerTime() {
    var localBefore = Date.now();
    return dbGet("/.info/serverTimeOffset")
      .then(function (offset) {
        if (typeof offset === "number") {
          _serverTimeOffset = offset;
          _log("Server time offset: " + offset + "ms");
        }
      })
      .catch(function () {});
  }

  function _serverNow() {
    return Date.now() + _serverTimeOffset;
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
    _lastAnswerToken = "";
    _answerLock = false;
    clearTimeout(_answerDebounceTimer);
    _answerDebounceTimer = null;
    _gameOverEmitted = false;
    _rematchVotes = {};
    _lastHpSnapshot = {};
    _gameOverBroadcastLock = false;
    _eliminationProcessed = {};
    _hpWriteSeq = {};
    _myHpSeq = 0;
    _log("Round reset");
  }

  function stopPoll() {
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
    }
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
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
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      wpm: 0,
      progress: 0,
      ready: true,
      online: true,
      eliminated: false,
      currentHP: PLAYER_MAX_HP,
      lastSeen: Date.now(),
    };
  }

  function _updateLobbyUI() {
    var list = Object.values(players);
    var grid = document.getElementById("lobbyPlayers");
    if (grid) {
      grid.innerHTML = list
        .map(function (p) {
          var isMe = p.id === pid;
          return (
            '<div class="lpc ready">' +
            '<div class="lpc-avatar">' +
            _renderAvatar(p.avatar) +
            "</div>" +
            '<div class="lpc-name bb">' +
            p.name +
            (isMe ? " (YOU)" : "") +
            "</div>" +
            '<div class="lpc-status" style="color:var(--g)">READY</div></div>'
          );
        })
        .join("");
    }
    var st = document.getElementById("lobbyStatus");
    if (st)
      st.textContent = list.length + "/" + MAX_PLAYERS + " PILOT(S) IN LOBBY";
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
      _log("Winner determined by host: " + val);
      dbUpd("rooms/" + room, {
        gameOver: val,
        status: "ended",
        endedAt: Date.now(),
      });
    }
  }

  function _startHeartbeat(code) {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(function () {
      if (!room || !pid) return;
      var now = Date.now();
      if (now - _lastPollAt > 3000) {
        _log("Heartbeat: poll gap detected, reconnecting");
        _attemptReconnect(code);
      }
      dbUpd("rooms/" + code + "/players/" + pid, { lastSeen: now });
    }, 5000);
  }

  function _attemptReconnect(code) {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(function () {
      if (!room) return;
      _log("Attempting reconnect to " + code);
      dbGet("rooms/" + code).then(function (r) {
        if (!r) {
          _log("Room gone on reconnect");
          return;
        }
        if (r.players && r.players[pid]) {
          _log("Reconnect OK, updating lastSeen");
          dbUpd("rooms/" + code + "/players/" + pid, {
            lastSeen: Date.now(),
            online: true,
          });
        }
      });
    }, 1000);
  }

  function startPoll(code) {
    stopPoll();
    _lastPollAt = Date.now();
    _poll = setInterval(function () {
      _lastPollAt = Date.now();
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;

        var fp = r.players || {};
        var snap = JSON.stringify(fp);

        if (snap !== _lastPlayerSnap) {
          _lastPlayerSnap = snap;

          var hpChanged = false;
          Object.keys(fp).forEach(function (id) {
            var prev = _lastHpSnapshot[id];
            var curr = fp[id] ? fp[id].hp || 0 : 0;
            if (prev !== curr) {
              hpChanged = true;
              _lastHpSnapshot[id] = curr;
            }
          });

          var mergedPlayers = {};
          Object.keys(fp).forEach(function (id) {
            var remote = fp[id];
            var local = players[id];
            if (id === pid && local && _myHpSeq > 0) {
              mergedPlayers[id] = Object.assign({}, remote, {
                hp: local.hp,
                currentHP: local.currentHP,
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
            if (hpChanged) emit("hp_sync", { players: Object.values(players) });
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
          _lastAnswerToken = "";
          _answerLock = false;
          _log("Game started, word: " + (r.currentWord || ""));
          emit("game_start", {
            word: r.currentWord || "",
            players: Object.values(players),
          });
        }

        var rSig = (r.rematchWord || "") + "|" + (r.rematchStartedAt || 0);
        if (
          r.rematchWord &&
          r.rematchWord !== "" &&
          rSig !== _lastRematchSig &&
          _gameStarted
        ) {
          _lastRematchSig = rSig;
          _gameEnded = false;
          _isMatchEnded = false;
          _gameOverEmitted = false;
          _gameOverBroadcastLock = false;
          _lastGameOver = "";
          _processedEvents = {};
          _eliminationProcessed = {};
          _lastVoteSnap = "";
          _lastAnswerToken = "";
          _answerLock = false;
          _doingRematch = false;
          _rematchVotes = {};
          _hpWriteSeq = {};
          _myHpSeq = 0;
          _log("Rematch start, word: " + r.rematchWord);
          emit("rematch_start", {
            word: r.rematchWord,
            players: Object.values(players),
          });
        }

        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver && !_gameOverEmitted) {
          _lastGameOver = goVal;
          _gameEnded = true;
          _isMatchEnded = true;
          _gameOverEmitted = true;
          _gameOverBroadcastLock = true;
          _winnerId = goVal === "none" ? null : goVal;
          var goPl = r.players
            ? Object.values(r.players)
            : Object.values(players);
          _log(
            "Game over received: winner=" + goVal + " players=" + goPl.length,
          );
          emit("game_over", {
            winnerId: _winnerId,
            players: goPl,
            isMatchEnded: true,
          });
        }

        var rv = r.rematchVotes || {};
        var vSnap = JSON.stringify(rv);
        if (vSnap !== _lastVoteSnap) {
          _lastVoteSnap = vSnap;
          _rematchVotes = rv;
          var pIds = Object.keys(players);
          if (pIds.length >= MIN_PLAYERS) _handleRematchVotes(rv, pIds);
        }

        var evs = r.events || {};
        var now = Date.now();
        Object.keys(evs).forEach(function (k) {
          var ev = evs[k];
          if (!ev || !ev.ts) return;
          if (now - ev.ts > 8000) return;
          if (_processedEvents[k]) return;
          _processedEvents[k] = true;

          if (ev.type === "typing" && ev.from !== pid) {
            emit("player_typing", { playerId: ev.from, name: ev.name });
          }

          if (ev.type === "eliminate" && ev.target) {
            var eTarget = ev.target;
            if (players[eTarget]) {
              players[eTarget].hp = 0;
              players[eTarget].eliminated = true;
              players[eTarget].currentHP = 0;
            }
            if (!_eliminationProcessed[eTarget]) {
              _eliminationProcessed[eTarget] = true;
              _log("Eliminate event for: " + eTarget);
              emit("player_eliminated", { playerId: eTarget });
            }
            if (isHost && !_isMatchEnded && !_gameOverBroadcastLock) {
              _log(
                "Host re-checking winner after eliminate event for " + eTarget,
              );
              dbGet("rooms/" + room + "/players").then(function (freshFp) {
                if (!freshFp || _isMatchEnded || _gameOverBroadcastLock) return;
                Object.keys(freshFp).forEach(function (id) {
                  if (players[id]) {
                    freshFp[id].hp = Math.min(
                      freshFp[id].hp || 0,
                      players[id].hp || 0,
                    );
                    if (players[id].eliminated) freshFp[id].eliminated = true;
                  }
                });
                players = freshFp;
                _checkAndBroadcastWinner(freshFp);
              });
            }
          }

          if (
            ev.type === "timer_end" &&
            isHost &&
            !_isMatchEnded &&
            !_gameOverBroadcastLock
          ) {
            _log("Timer end event received by host");
            _handleTimerEndAsHost(r.players || players);
          }
        });

        var timerEnd = r.timerEnd || 0;
        if (
          timerEnd > 0 &&
          isHost &&
          !_isMatchEnded &&
          !_gameOverBroadcastLock
        ) {
          _log("Host sees timerEnd flag, resolving winner");
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
    var sorted = allP.slice().sort(function (a, b) {
      return (b.hp || 0) - (a.hp || 0);
    });
    var winnerId = sorted[0] ? sorted[0].id : null;
    if (!winnerId) winnerId = null;
    var val = winnerId || "none";
    _lastGameOver = val;
    _gameOverEmitted = false;
    _log("Host resolving timer end, winner: " + val);
    dbUpd("rooms/" + room, {
      gameOver: val,
      status: "ended",
      endedAt: Date.now(),
      timerEnd: 0,
    });
  }

  function _handleRematchVotes(votes, pIds) {
    var totalAccept = pIds.filter(function (k) {
      return votes[k] === true;
    }).length;
    var hasDecline = pIds.some(function (k) {
      return votes[k] === false;
    });
    _log(
      "Rematch votes: accept=" +
        totalAccept +
        "/" +
        pIds.length +
        " decline=" +
        hasDecline,
    );
    emit("rematch_votes_update", {
      votes: totalAccept,
      total: pIds.length,
      voteMap: votes,
      hasDecline: hasDecline,
    });
    if (!hasDecline && isHost && totalAccept >= pIds.length && !_doingRematch) {
      _doingRematch = true;
      _log("All accepted, starting rematch");
      dbUpd("rooms/" + room, { rematchVotes: null }).then(function () {
        startRematch();
      });
    }
  }

  function _setupBeforeUnload(code) {
    window.addEventListener("beforeunload", function () {
      try {
        navigator.sendBeacon(
          FIREBASE_URL + "/rooms/" + code + "/players/" + pid + "/hp.json",
          JSON.stringify(0),
        );
        navigator.sendBeacon(
          FIREBASE_URL +
            "/rooms/" +
            code +
            "/players/" +
            pid +
            "/eliminated.json",
          JSON.stringify(true),
        );
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
      code: code,
      host: pid,
      status: "lobby",
      createdAt: Date.now(),
      currentWord: "",
      rematchWord: "",
      rematchStartedAt: 0,
      gameOver: "",
      events: {},
      rematchVotes: {},
      answerLock: {},
      players: {},
      timerEnd: 0,
    };
    data.players[pid] = _entry(p);
    return _syncServerTime()
      .then(function () {
        return dbSet("rooms/" + code, data);
      })
      .then(function () {
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
      if (!r) {
        Effects.showToast("ROOM TIDAK DITEMUKAN!", "error");
        return null;
      }
      if (r.status === "playing" || r.status === "ended") {
        Effects.showToast("GAME SEDANG BERLANGSUNG!", "error");
        return null;
      }
      var cnt = r.players ? Object.keys(r.players).length : 0;
      if (cnt >= MAX_PLAYERS) {
        Effects.showToast("ROOM PENUH! (MAKS " + MAX_PLAYERS + ")", "error");
        return null;
      }
      p.id = p.id || genId();
      pid = p.id;
      isHost = false;
      room = code;
      _resetRound();
      return _syncServerTime()
        .then(function () {
          return dbSet("rooms/" + code + "/players/" + pid, _entry(p));
        })
        .then(function () {
          return dbGet("rooms/" + code + "/players");
        })
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
      status: "playing",
      currentWord: word,
      rematchWord: "",
      rematchStartedAt: 0,
      gameOver: "",
      rematchVotes: null,
      startedAt: Date.now(),
      events: {},
      answerLock: {},
      endedAt: 0,
      timerEnd: 0,
    };
    list.forEach(function (p) {
      updates["players/" + p.id + "/hp"] = PLAYER_MAX_HP;
      updates["players/" + p.id + "/currentHP"] = PLAYER_MAX_HP;
      updates["players/" + p.id + "/wpm"] = 0;
      updates["players/" + p.id + "/progress"] = 0;
      updates["players/" + p.id + "/eliminated"] = false;
      updates["players/" + p.id + "/lastSeen"] = Date.now();
      if (players[p.id]) {
        players[p.id].hp = PLAYER_MAX_HP;
        players[p.id].currentHP = PLAYER_MAX_HP;
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
    _processedEvents = {};
    _eliminationProcessed = {};
    _gameEnded = false;
    _isMatchEnded = false;
    _gameOverEmitted = false;
    _gameOverBroadcastLock = false;
    _lastGameOver = "";
    _winnerId = null;
    _hpWriteSeq = {};
    _myHpSeq = 0;
    var word = Words.getEasy();
    var ts = Date.now();
    return dbGet("rooms/" + room + "/players").then(function (fp) {
      var allP = fp || players;
      var updates = {
        status: "playing",
        currentWord: word,
        rematchWord: word,
        rematchStartedAt: ts,
        gameOver: "",
        rematchVotes: null,
        startedAt: ts,
        events: {},
        answerLock: {},
        endedAt: 0,
        timerEnd: 0,
      };
      Object.keys(allP).forEach(function (id) {
        updates["players/" + id + "/hp"] = PLAYER_MAX_HP;
        updates["players/" + id + "/currentHP"] = PLAYER_MAX_HP;
        updates["players/" + id + "/wpm"] = 0;
        updates["players/" + id + "/progress"] = 0;
        updates["players/" + id + "/eliminated"] = false;
        updates["players/" + id + "/lastSeen"] = ts;
        if (players[id]) {
          players[id].hp = PLAYER_MAX_HP;
          players[id].currentHP = PLAYER_MAX_HP;
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
    return dbSet(
      "rooms/" + room + "/rematchVotes/" + pid,
      accept === false ? false : true,
    );
  }

  function trySubmitAnswer(token) {
    if (!room || !pid || _isMatchEnded) return Promise.resolve(false);
    if (_answerLock) {
      _log("Answer locked, ignoring submit");
      return Promise.resolve(false);
    }
    if (token === _lastAnswerToken) {
      _log("Duplicate token, ignoring");
      return Promise.resolve(false);
    }

    clearTimeout(_answerDebounceTimer);
    return new Promise(function (resolve) {
      _answerDebounceTimer = setTimeout(function () {
        if (_answerLock || _isMatchEnded) {
          resolve(false);
          return;
        }
        var lockPath = "rooms/" + room + "/answerLock/" + token;
        dbGet(lockPath)
          .then(function (existing) {
            if (existing !== null && existing !== undefined) {
              _log("Answer token already claimed: " + token);
              resolve(false);
              return null;
            }
            return dbSet(lockPath, { by: pid, ts: Date.now() });
          })
          .then(function (result) {
            if (!result) {
              resolve(false);
              return null;
            }
            return dbGet(lockPath);
          })
          .then(function (val) {
            if (!val || val.by !== pid) {
              _log("Race lost for token: " + token);
              resolve(false);
              return;
            }
            _lastAnswerToken = token;
            _answerLock = true;
            _log("Answer lock acquired for token: " + token);
            setTimeout(function () {
              _answerLock = false;
            }, 800);
            resolve(true);
          })
          .catch(function () {
            resolve(false);
          });
      }, 30);
    });
  }

  function pushHp(targetId, hp) {
    if (!room || !pid || _isMatchEnded) return Promise.resolve();
    var safe = Math.max(0, Math.min(PLAYER_MAX_HP, Math.ceil(hp)));
    var seq = (_hpWriteSeq[targetId] || 0) + 1;
    _hpWriteSeq[targetId] = seq;
    var mySeq = seq;
    if (players[targetId]) {
      players[targetId].hp = safe;
      players[targetId].currentHP = safe;
    }
    _lastHpSnapshot[targetId] = safe;
    return dbUpd("rooms/" + room + "/players/" + targetId, {
      hp: safe,
      currentHP: safe,
    }).then(function (result) {
      if (_hpWriteSeq[targetId] !== mySeq) {
        _log("HP write seq outdated for " + targetId + ", ignoring");
      }
      return result;
    });
  }

  function pushMyHp(hp) {
    if (!room || !pid) return Promise.resolve();
    var safe = Math.max(0, Math.min(PLAYER_MAX_HP, Math.ceil(hp)));
    _myHpSeq++;
    var mySeq = _myHpSeq;
    if (players[pid]) {
      players[pid].hp = safe;
      players[pid].currentHP = safe;
    }
    _lastHpSnapshot[pid] = safe;
    _log("Push my HP: " + safe + " seq=" + mySeq);
    return dbUpd("rooms/" + room + "/players/" + pid, {
      hp: safe,
      currentHP: safe,
    }).then(function () {
      if (_myHpSeq !== mySeq) {
        _log("My HP seq outdated, skip elimination check");
        return;
      }
      if (safe === 0 && !_isMatchEnded) {
        return dbUpd("rooms/" + room + "/players/" + pid, { eliminated: true })
          .then(function () {
            if (players[pid]) players[pid].eliminated = true;
            var eKey = Date.now().toString(36) + "_e";
            return dbSet("rooms/" + room + "/events/" + eKey, {
              type: "eliminate",
              target: pid,
              from: pid,
              ts: Date.now(),
            });
          })
          .then(function () {
            if (isHost) {
              return dbGet("rooms/" + room + "/players").then(function (fp) {
                if (!fp) return;
                players = fp;
                _checkAndBroadcastWinner(fp);
              });
            }
          });
      }
    });
  }

  function pushMyProgress(progress, wpm) {
    if (!room || !pid) return Promise.resolve();
    if (players[pid]) {
      players[pid].progress = progress;
      players[pid].wpm = wpm;
    }
    return dbUpd("rooms/" + room + "/players/" + pid, {
      progress: progress,
      wpm: wpm,
    });
  }

  function sendTyping() {
    if (!room || !pid) return Promise.resolve();
    var id = Date.now().toString(36) + "_t";
    return dbSet("rooms/" + room + "/events/" + id, {
      type: "typing",
      from: pid,
      name: (players[pid] && players[pid].name) || "?",
      ts: Date.now(),
    });
  }

  function pushOpponentHp(oppId, hp) {
    if (!room || !pid || _isMatchEnded) return Promise.resolve();
    if (!isHost) return Promise.resolve();
    return pushHp(oppId, hp).then(function () {
      if (hp <= 0 && !_isMatchEnded) {
        return dbUpd("rooms/" + room + "/players/" + oppId, {
          eliminated: true,
        })
          .then(function () {
            if (players[oppId]) players[oppId].eliminated = true;
            var eKey = Date.now().toString(36) + "_e";
            return dbSet("rooms/" + room + "/events/" + eKey, {
              type: "eliminate",
              target: oppId,
              from: pid,
              ts: Date.now(),
            });
          })
          .then(function () {
            return dbGet("rooms/" + room + "/players").then(function (fp) {
              if (!fp) return;
              players = fp;
              _checkAndBroadcastWinner(fp);
            });
          });
      }
    });
  }

  function broadcastTimerEnd(currentPlayers) {
    if (!room || _isMatchEnded || _gameOverBroadcastLock)
      return Promise.resolve();
    _log("Broadcasting timer end");
    var updates = { timerEnd: Date.now() };
    if (isHost) {
      var allP = currentPlayers || Object.values(players);
      var sorted = allP.slice().sort(function (a, b) {
        return (b.hp || 0) - (a.hp || 0);
      });
      var winnerId = sorted[0] ? sorted[0].id : null;
      var val = winnerId || "none";
      _gameOverBroadcastLock = true;
      _isMatchEnded = true;
      _lastGameOver = val;
      updates.gameOver = val;
      updates.status = "ended";
      updates.endedAt = Date.now();
      _log("Host broadcasting timer end with winner: " + val);
    }
    return dbUpd("rooms/" + room, updates);
  }

  function broadcastGameOver(winnerId) {
    if (!room || _isMatchEnded || _gameOverBroadcastLock)
      return Promise.resolve();
    _isMatchEnded = true;
    _gameEnded = true;
    _gameOverBroadcastLock = true;
    _winnerId = winnerId;
    var val = winnerId || "none";
    _lastGameOver = val;
    _log("Broadcasting game over: " + val);
    return dbUpd("rooms/" + room, {
      gameOver: val,
      status: "ended",
      endedAt: Date.now(),
    });
  }

  function leaveRoom() {
    stopPoll();
    var r = room,
      p = pid,
      host = isHost;
    room = null;
    pid = null;
    isHost = false;
    players = {};
    _resetRound();
    if (r && p) {
      dbDel("rooms/" + r + "/players/" + p);
      if (host) dbDel("rooms/" + r);
    }
    return Promise.resolve();
  }

  function getPlayers() {
    return Object.values(players);
  }
  function getPlayer() {
    return players[pid];
  }
  function getCurrentRoom() {
    return room;
  }
  function getIsHost() {
    return isHost;
  }
  function getPlayerId() {
    return pid;
  }
  function generatePlayerId() {
    return genId();
  }
  function getMinPlayers() {
    return MIN_PLAYERS;
  }
  function getMaxPlayers() {
    return MAX_PLAYERS;
  }
  function getRenderAvatar() {
    return _renderAvatar;
  }
  function getPlayerMaxHp() {
    return PLAYER_MAX_HP;
  }
  function isMatchEndedFn() {
    return _isMatchEnded;
  }
  function getWinnerId() {
    return _winnerId;
  }
  function getAlivePlayers() {
    return _getAlivePlayers(players);
  }
  function getDebugLog() {
    return _debugLog.slice();
  }

  return {
    on,
    generatePlayerId,
    createRoom,
    joinRoom,
    startGame,
    startRematch,
    voteRematch,
    trySubmitAnswer,
    pushMyHp,
    pushMyProgress,
    pushHp,
    pushOpponentHp,
    broadcastTimerEnd,
    broadcastGameOver,
    sendTyping,
    leaveRoom,
    getPlayers,
    getPlayer,
    getCurrentRoom,
    getIsHost,
    getPlayerId,
    getMinPlayers,
    getMaxPlayers,
    getRenderAvatar,
    getPlayerMaxHp,
    isMatchEnded: isMatchEndedFn,
    getWinnerId,
    getAlivePlayers,
    getDebugLog,
  };
})();
