var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";
var _mpCurrentWord = "";

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

  var _lastStatus = "";
  var _lastGameOver = "";
  var _lastRematchSig = "";
  var _lastPlayerSnap = "";
  var _lastEventsSnap = "";
  var _lastDmgSnap = "";
  var _processedEvents = {};
  var _processedDmg = {};
  var _rematchStarted = false;
  var _doingRematch = false;
  var _gameOverBroadcasted = false;
  var _hostDmgInterval = null;

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
      } catch (x) {}
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

  function _resetState() {
    _lastStatus = "";
    _lastGameOver = "";
    _lastRematchSig = "";
    _lastPlayerSnap = "";
    _lastEventsSnap = "";
    _lastDmgSnap = "";
    _processedEvents = {};
    _processedDmg = {};
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
        var toProcess = [];
        keys.forEach(function (k) {
          if (!_processedDmg[k]) {
            _processedDmg[k] = true;
            toProcess.push(dmgMap[k]);
          }
        });
        if (toProcess.length === 0) return;

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
            var newHp = Math.max(0, curHp - ev.amount);
            fp[ev.targetId].hp = newHp;
            hpUpdates["players/" + ev.targetId + "/hp"] = newHp;
            changed = true;
          });

          if (!changed) return;

          var alive = Object.values(fp).filter(function (p) {
            return (p.hp || 0) > 0;
          });
          var isOver = alive.length <= 1;

          if (isOver && !_gameOverBroadcasted) {
            _gameOverBroadcasted = true;
            var winnerId = alive.length === 1 ? alive[0].id : null;
            var goVal = winnerId || "none";
            _lastGameOver = goVal;
            hpUpdates["gameOver"] = goVal;
            hpUpdates["status"] = "ended";
            hpUpdates["dmg"] = null;
          }

          // Also clear processed dmg keys to prevent re-processing
          if (!isOver) {
            Object.keys(_processedDmg).forEach(function (k) {
              hpUpdates["dmg/" + k] = null;
            });
          }
          dbUpd("rooms/" + room, hpUpdates);
        });
      });
    }, 120);
  }

  function startPoll(code) {
    stopPoll();
    _poll = setInterval(function () {
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;

        var fp = r.players || {};
        var snap = JSON.stringify(fp);
        if (snap !== _lastPlayerSnap) {
          _lastPlayerSnap = snap;
          players = fp;
          emit("players_update", { players: Object.values(players) });
          _updateLobbyUI();
          if (_lastStatus === "playing") {
            emit("hp_sync", { players: Object.values(players) });
          }
        }

        var status = r.status || "lobby";

        if (status === "playing" && _lastStatus !== "playing") {
          _lastStatus = "playing";
          _gameOverBroadcasted = false;
          _rematchStarted = false;
          _doingRematch = false;
          _processedEvents = {};
          _processedDmg = {};
          if (isHost) _startHostDmgProcessor();
          if (r.currentWord) {
            emit("game_start", {
              word: r.currentWord,
              players: Object.values(players),
            });
          }
        }

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
          _processedEvents = {};
          _processedDmg = {};
          if (isHost) _startHostDmgProcessor();
          emit("rematch_start", {
            word: r.rematchWord,
            players: Object.values(players),
          });
        }

        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver) {
          _lastGameOver = goVal;
          if (status !== "lobby") {
            _stopHostDmgProcessor();
            var goWin = goVal === "none" ? null : goVal;
            var goPl = r.players
              ? Object.values(r.players)
              : Object.values(players);
            emit("game_over", { winnerId: goWin, players: goPl });
          }
        }

        var rv = r.rematchVotes || {};
        var pIds = Object.keys(players);
        if (pIds.length >= MIN_PLAYERS && Object.keys(rv).length > 0) {
          _handleRematchVotes(rv, pIds);
        }

        var evs = r.events || {};
        var evSnap = JSON.stringify(Object.keys(evs));
        if (evSnap !== _lastEventsSnap) {
          _lastEventsSnap = evSnap;
          var now = Date.now();
          Object.keys(evs).forEach(function (k) {
            var ev = evs[k];
            if (!ev || !ev.ts) return;
            if (now - ev.ts > 5000) return;
            if (_processedEvents[k]) return;
            _processedEvents[k] = true;
            if (ev.type === "typing" && ev.from !== pid) {
              emit("player_typing", { playerId: ev.from, name: ev.name });
            }
          });
        }
      });
    }, POLL_MS);
  }

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
        startRematch();
      });
    }
  }

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
    _processedEvents = {};
    _processedDmg = {};
    _gameOverBroadcasted = false;
    var word = Words.getByWave(1);
    _mpCurrentWord = word;
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
      _lastStatus = "playing";
      _startHostDmgProcessor();
    });
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    _processedEvents = {};
    _processedDmg = {};
    _gameOverBroadcasted = false;
    var word = Words.getByWave(1);
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

  function pushMyHp(hp) {
    if (!room || !pid) return Promise.resolve();
    var safe = Math.max(0, Math.min(PLAYER_MAX_HP, Math.ceil(hp)));
    if (players[pid]) players[pid].hp = safe;
    return dbSet("rooms/" + room + "/players/" + pid + "/hp", safe);
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

  function sendDamage(targetId, amount) {
    if (!room || !pid || !targetId || amount <= 0) return Promise.resolve();
    var key =
      Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4);
    return dbSet("rooms/" + room + "/dmg/" + key, {
      fromId: pid,
      targetId: targetId,
      amount: amount,
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
      amount: amount,
      ts: Date.now(),
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

  function broadcastGameOver(winnerId) {
    if (!room) return Promise.resolve();
    var val = winnerId || "none";
    if (_lastGameOver === val) return Promise.resolve();
    _gameOverBroadcasted = true;
    _lastGameOver = val;
    _stopHostDmgProcessor();
    return dbUpd("rooms/" + room, { gameOver: val, status: "ended" });
  }

  function pushOpponentHp(oppId, hp) {
    return Promise.resolve();
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
  function getCurrentWord() {
    return _mpCurrentWord;
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
    getCurrentWord,
  };
})();
