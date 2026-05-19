var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null,
    pid = null,
    isHost = false;
  var players = {};
  var cbs = {};
  var _poll = null;
  var POLL_MS = 150; // faster polling for better sync
  var PLAYER_MAX_HP = 200,
    MAX_PLAYERS = 4,
    MIN_PLAYERS = 2;

  // --- local state tracking ---
  var _lastStatus = "";
  var _lastGameOver = "";
  var _lastRematchSig = "";
  var _lastPlayerSnap = "";
  var _lastEventsSnap = "";
  var _processedDmg = {};
  var _rematchStarted = false;
  var _doingRematch = false;
  var _gameOverBroadcasted = false;
  var _hostDmgInterval = null;
  // Track the last known HP for each player so we can detect real changes
  var _lastKnownHp = {};

  // ─── helpers ────────────────────────────────────────────────────────────────

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
        console.error("emit err", ev, x);
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
      .catch(function () {
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

  // ─── state reset ────────────────────────────────────────────────────────────

  function _resetState() {
    _lastStatus = "";
    _lastGameOver = "";
    _lastRematchSig = "";
    _lastPlayerSnap = "";
    _lastEventsSnap = "";
    _processedDmg = {};
    _lastKnownHp = {};
    _rematchStarted = false;
    _doingRematch = false;
    _gameOverBroadcasted = false;
    _stopHostDmgProcessor();
  }

  function stopPoll() {
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
    }
  }

  function _stopHostDmgProcessor() {
    if (_hostDmgInterval) {
      clearInterval(_hostDmgInterval);
      _hostDmgInterval = null;
    }
  }

  // ─── avatar render ──────────────────────────────────────────────────────────

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
    };
  }

  // ─── lobby UI ───────────────────────────────────────────────────────────────

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

  // ─── HOST: authoritative damage processor ───────────────────────────────────
  //
  // ONLY the host reads the /dmg queue and applies damage to /players/{id}/hp.
  // Non-host clients NEVER write to /players/{id}/hp directly.
  // This eliminates race conditions and HP desync completely.

  function _startHostDmgProcessor() {
    _stopHostDmgProcessor();
    if (!isHost) return;

    _hostDmgInterval = setInterval(function () {
      if (!room || !isHost || _gameOverBroadcasted) return;
      if (_lastStatus !== "playing") return;

      dbGet("rooms/" + room + "/dmg").then(function (dmgMap) {
        if (!dmgMap) return;
        var keys = Object.keys(dmgMap);
        if (keys.length === 0) return;

        // Find unprocessed damage events
        var toProcess = [];
        keys.forEach(function (k) {
          if (!_processedDmg[k]) {
            _processedDmg[k] = true;
            toProcess.push(dmgMap[k]);
          }
        });
        if (toProcess.length === 0) return;

        // Fetch fresh authoritative HP state
        dbGet("rooms/" + room + "/players").then(function (fp) {
          if (!fp) return;

          var hpUpdates = {};
          var changed = false;

          toProcess.forEach(function (ev) {
            if (!ev || !ev.targetId || ev.amount == null) return;
            var target = fp[ev.targetId];
            if (!target) return;
            var curHp =
              typeof target.hp === "number" ? target.hp : PLAYER_MAX_HP;
            if (curHp <= 0) return; // already dead, ignore further damage
            var newHp = Math.max(0, curHp - ev.amount);
            fp[ev.targetId].hp = newHp;
            hpUpdates["players/" + ev.targetId + "/hp"] = newHp;
            changed = true;
          });

          if (!changed) return;

          // Check if game is over (only 1 or 0 players alive)
          var allPlayers = Object.values(fp);
          var alive = allPlayers.filter(function (p) {
            return (p.hp || 0) > 0;
          });
          var isOver = alive.length <= 1;

          if (isOver && !_gameOverBroadcasted) {
            _gameOverBroadcasted = true;
            _stopHostDmgProcessor(); // stop processing more damage

            var winnerId = alive.length === 1 ? alive[0].id : null;
            var goVal = winnerId || "none";
            _lastGameOver = goVal;

            // Write HP updates AND game over AND status in one atomic patch
            hpUpdates["gameOver"] = goVal;
            hpUpdates["status"] = "ended";
            hpUpdates["dmg"] = null; // clear damage queue

            dbUpd("rooms/" + room, hpUpdates);
          } else {
            // Just update HP values; no game over yet
            // Also clear the processed dmg keys from Firebase to keep it clean
            var clearUpdate = {};
            Object.keys(_processedDmg).forEach(function (k) {
              if (dmgMap[k] !== undefined) clearUpdate["dmg/" + k] = null;
            });
            Object.assign(hpUpdates, clearUpdate);
            dbUpd("rooms/" + room, hpUpdates);
          }
        });
      });
    }, 100); // run every 100ms for snappy HP sync
  }

  // ─── polling loop ────────────────────────────────────────────────────────────

  function startPoll(code) {
    stopPoll();
    _poll = setInterval(function () {
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;

        // ── player HP / state sync ──────────────────────────────────────────
        var fp = r.players || {};
        var snap = JSON.stringify(fp);
        if (snap !== _lastPlayerSnap) {
          _lastPlayerSnap = snap;
          players = fp;

          // Detect per-player HP changes and notify game
          var hpChanged = false;
          Object.values(fp).forEach(function (p) {
            var prev = _lastKnownHp[p.id];
            if (prev === undefined || prev !== p.hp) {
              _lastKnownHp[p.id] = p.hp;
              hpChanged = true;
            }
          });

          emit("players_update", { players: Object.values(players) });
          _updateLobbyUI();

          if (_lastStatus === "playing") {
            // Always emit hp_sync when any HP changes so all clients stay in sync
            emit("hp_sync", { players: Object.values(players) });
          }
        }

        // ── status transitions ───────────────────────────────────────────────
        var status = r.status || "lobby";

        if (status === "playing" && _lastStatus !== "playing") {
          _lastStatus = "playing";
          _gameOverBroadcasted = false;
          _rematchStarted = false;
          _doingRematch = false;
          _processedDmg = {};
          _lastKnownHp = {};
          if (isHost) _startHostDmgProcessor();
          if (r.currentWord) {
            emit("game_start", {
              word: r.currentWord,
              players: Object.values(players),
            });
          }
        }

        // ── rematch ──────────────────────────────────────────────────────────
        var rSig = (r.rematchWord || "") + "|" + (r.rematchStartedAt || "");
        if (
          r.rematchWord &&
          r.rematchWord !== "" &&
          rSig !== _lastRematchSig &&
          (_lastStatus === "playing" || _lastStatus === "ended")
        ) {
          _lastRematchSig = rSig;
          _lastStatus = "playing";
          _gameOverBroadcasted = false;
          _rematchStarted = false;
          _doingRematch = false;
          _processedDmg = {};
          _lastKnownHp = {};
          if (isHost) _startHostDmgProcessor();
          emit("rematch_start", {
            word: r.rematchWord,
            players: Object.values(players),
          });
        }

        // ── game over ────────────────────────────────────────────────────────
        // IMPORTANT: read from Firebase, not local cache.
        // Every client reacts to the same authoritative gameOver value.
        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver) {
          _lastGameOver = goVal;
          if (status !== "lobby") {
            _stopHostDmgProcessor();
            var goWin = goVal === "none" ? null : goVal;
            // Use the players from Firebase (authoritative HP)
            var goPl = r.players
              ? Object.values(r.players)
              : Object.values(players);
            emit("game_over", { winnerId: goWin, players: goPl });
          }
        }

        // ── rematch votes ────────────────────────────────────────────────────
        var rv = r.rematchVotes || {};
        var pIds = Object.keys(players);
        if (pIds.length >= MIN_PLAYERS && Object.keys(rv).length > 0) {
          _handleRematchVotes(rv, pIds);
        }

        // ── typing events ────────────────────────────────────────────────────
        var evs = r.events || {};
        var evSnap = JSON.stringify(Object.keys(evs).sort());
        if (evSnap !== _lastEventsSnap) {
          _lastEventsSnap = evSnap;
          var now = Date.now();
          Object.keys(evs).forEach(function (k) {
            var ev = evs[k];
            if (!ev || !ev.ts) return;
            if (now - ev.ts > 5000) return;
            // Already processed check happens via timestamp freshness
            if (ev.type === "typing" && ev.from !== pid) {
              emit("player_typing", { playerId: ev.from, name: ev.name });
            }
          });
        }
      });
    }, POLL_MS);
  }

  // ─── rematch vote handler ────────────────────────────────────────────────────

  function _handleRematchVotes(votes, pIds) {
    var totalAccept = pIds.filter(function (k) {
      return votes[k] === true;
    }).length;
    var hasDecline = pIds.some(function (k) {
      return votes[k] === false;
    });
    emit("rematch_votes_update", {
      votes: totalAccept,
      total: pIds.length,
      voteMap: votes,
      hasDecline: hasDecline,
    });
    if (
      !hasDecline &&
      isHost &&
      totalAccept >= pIds.length &&
      !_rematchStarted &&
      !_doingRematch
    ) {
      _doingRematch = true;
      _rematchStarted = true;
      dbUpd("rooms/" + room, { rematchVotes: null }).then(function () {
        startRematch().then(function () {
          // Host directly starts rematch game, same as startGame fix.
          // Polling won't emit rematch_start for host because _lastRematchSig
          // is pre-set inside startRematch(), blocking the condition.
          emit("rematch_start", {
            word: Multiplayer._currentWord,
            players: Object.values(players),
          });
        });
      });
    }
  }

  // ─── beforeunload ────────────────────────────────────────────────────────────

  function _setupBeforeUnload(code) {
    window.addEventListener("beforeunload", function () {
      try {
        navigator.sendBeacon(
          FIREBASE_URL + "/rooms/" + code + "/players/" + pid + "/online.json",
          JSON.stringify(false),
        );
      } catch (x) {}
    });
  }

  // ─── public API ─────────────────────────────────────────────────────────────

  function createRoom(p) {
    p.id = p.id || genId();
    pid = p.id;
    isHost = true;
    _resetState();
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
      dmg: {},
      rematchVotes: {},
      players: {},
    };
    data.players[pid] = _entry(p);
    return dbSet("rooms/" + code, data).then(function () {
      players = {};
      players[pid] = _entry(p);
      startPoll(code);
      _setupBeforeUnload(code);
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
      _resetState();
      return dbSet("rooms/" + code + "/players/" + pid, _entry(p))
        .then(function () {
          return dbGet("rooms/" + code + "/players");
        })
        .then(function (all) {
          players = all || {};
          startPoll(code);
          _setupBeforeUnload(code);
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
    _lastGameOver = "";
    _lastRematchSig = "";
    _processedDmg = {};
    _lastKnownHp = {};
    _gameOverBroadcasted = false;

    var word = Words.getByWave(1);
    Multiplayer._currentWord = word;

    // Reset all player HP to full in one atomic write
    var updates = {
      status: "playing",
      currentWord: word,
      rematchWord: "",
      rematchStartedAt: 0,
      gameOver: "",
      rematchVotes: null,
      startedAt: Date.now(),
      events: {},
      dmg: {},
    };
    list.forEach(function (p) {
      updates["players/" + p.id + "/hp"] = PLAYER_MAX_HP;
      updates["players/" + p.id + "/wpm"] = 0;
      updates["players/" + p.id + "/progress"] = 0;
      if (players[p.id]) {
        players[p.id].hp = PLAYER_MAX_HP;
        players[p.id].wpm = 0;
        players[p.id].progress = 0;
      }
    });
    return dbUpd("rooms/" + room, updates).then(function () {
      _lastStatus = "playing"; // set AFTER write so polling can still fire game_start for host
      _startHostDmgProcessor();
    });
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    _processedDmg = {};
    _lastKnownHp = {};
    _gameOverBroadcasted = false;

    var word = Words.getByWave(1);
    Multiplayer._currentWord = word;
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
        dmg: {},
      };
      // Reset all HP to full atomically
      Object.keys(allP).forEach(function (id) {
        updates["players/" + id + "/hp"] = PLAYER_MAX_HP;
        updates["players/" + id + "/wpm"] = 0;
        updates["players/" + id + "/progress"] = 0;
        if (players[id]) {
          players[id].hp = PLAYER_MAX_HP;
          players[id].wpm = 0;
          players[id].progress = 0;
        }
      });
      _lastStatus = "playing";
      _lastGameOver = "";
      _lastRematchSig = word + "|" + ts;
      _doingRematch = false;
      return dbUpd("rooms/" + room, updates).then(function () {
        _startHostDmgProcessor();
      });
    });
  }

  function voteRematch(accept) {
    if (!room || !pid) return Promise.resolve();
    return dbSet(
      "rooms/" + room + "/rematchVotes/" + pid,
      accept === false ? false : true,
    );
  }

  // ─── damage API (client → Firebase /dmg queue) ───────────────────────────────
  //
  // Clients NEVER directly write /players/{id}/hp anymore.
  // They push damage events to /dmg, and the host applies them authoritatively.

  function sendDamage(targetId, amount) {
    if (!room || !pid || !targetId || amount <= 0) return Promise.resolve();
    var key =
      Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4);
    return dbSet("rooms/" + room + "/dmg/" + key, {
      fromId: pid,
      targetId: targetId,
      amount: Math.floor(amount),
      ts: Date.now(),
    });
  }

  function sendSelfDamage(amount) {
    if (!room || !pid || amount <= 0) return Promise.resolve();
    var key =
      Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4);
    return dbSet("rooms/" + room + "/dmg/" + key, {
      fromId: "enemy",
      targetId: pid,
      amount: Math.floor(amount),
      ts: Date.now(),
    });
  }

  // ─── progress/WPM sync (cosmetic only, not authoritative for HP) ─────────────

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

  // pushMyHp is kept for API compatibility but is now a no-op.
  // HP is only written by the host damage processor.
  function pushMyHp(hp) {
    return Promise.resolve();
  }

  // pushOpponentHp was already a no-op, keeping it.
  function pushOpponentHp(oppId, hp) {
    return Promise.resolve();
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

  // broadcastGameOver is kept for timer-based end (host only)
  function broadcastGameOver(winnerId) {
    if (!room || !isHost) return Promise.resolve();
    if (_gameOverBroadcasted) return Promise.resolve();
    _gameOverBroadcasted = true;
    _stopHostDmgProcessor();
    var val = winnerId || "none";
    _lastGameOver = val;
    return dbUpd("rooms/" + room, { gameOver: val, status: "ended" });
  }

  function leaveRoom() {
    stopPoll();
    _stopHostDmgProcessor();
    var r = room,
      p = pid,
      host = isHost;
    room = null;
    pid = null;
    isHost = false;
    players = {};
    _resetState();
    if (r && p) {
      dbDel("rooms/" + r + "/players/" + p);
      if (host) dbDel("rooms/" + r);
    }
    return Promise.resolve();
  }

  // ─── getters ─────────────────────────────────────────────────────────────────

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

  return {
    on,
    generatePlayerId,
    createRoom,
    joinRoom,
    startGame,
    startRematch,
    voteRematch,
    pushMyHp,
    pushMyProgress,
    pushOpponentHp,
    sendDamage,
    sendSelfDamage,
    sendTyping,
    broadcastGameOver,
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
  };
})();
