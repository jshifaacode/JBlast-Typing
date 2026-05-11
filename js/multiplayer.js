var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null,
    pid = null,
    isHost = false,
    players = {},
    cbs = {};
  var _ls = [],
    _bots = [],
    _poll = null,
    _lastSnap = "",
    _lastStatus = "";
  var _rematchVotes = {};
  var _rematchStarted = false;
  var PLAYER_MAX_HP = 200;
  var MAX_PLAYERS = 4;
  var MIN_PLAYERS = 2;

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
    if (cbs[ev]) cbs[ev](d);
  }

  function _fetch(path, opts) {
    return fetch(
      FIREBASE_URL + "/" + path + ".json",
      opts || { cache: "no-store" },
    )
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function dbGet(path) {
    return _fetch(path);
  }
  function dbSet(path, d) {
    return _fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    }).catch(function () {});
  }
  function dbUpd(path, d) {
    return _fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    }).catch(function () {});
  }
  function dbDel(path) {
    return fetch(FIREBASE_URL + "/" + path + ".json", {
      method: "DELETE",
    }).catch(function () {});
  }

  function listen(path, cb) {
    if (typeof EventSource === "undefined") return;
    try {
      var es = new EventSource(FIREBASE_URL + "/" + path + ".json");
      es.addEventListener("put", function (e) {
        try {
          var d = JSON.parse(e.data);
          cb(d.data, d.path || "/");
        } catch (x) {}
      });
      es.addEventListener("patch", function (e) {
        try {
          var d = JSON.parse(e.data);
          cb(d.data, d.path || "/");
        } catch (x) {}
      });
      es.onerror = function () {};
      _ls.push(es);
    } catch (x) {}
  }

  function stopListeners() {
    _ls.forEach(function (es) {
      try {
        es.close();
      } catch (x) {}
    });
    _ls = [];
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
    }
  }

  function _doRematch() {
    if (!isHost || _rematchStarted) return;
    _rematchStarted = true;
    dbUpd("rooms/" + room, { rematchVotes: null }).then(function () {
      startRematch();
    });
  }

  function startPoll(code) {
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
    }
    _poll = setInterval(function () {
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;
        var snap = JSON.stringify(r.players || {});
        if (snap !== _lastSnap) {
          _lastSnap = snap;
          players = r.players || {};
          emit("players_update", { players: Object.values(players) });
          _updateLobby();
        }

        var status = r.status || "lobby";

        if (!isHost && status === "playing" && _lastStatus !== "playing") {
          _lastStatus = "playing";
          if (r.currentWord) {
            emit("game_start", {
              word: r.currentWord,
              players: Object.values(players),
            });
          }
        }

        if (status === "lobby" && _lastStatus === "playing") {
          _lastStatus = "lobby";
        }

        if (status) _lastStatus = status;

        var rematchWord = r.rematchWord || "";
        var rematchKey = "rematch_" + rematchWord;
        if (rematchWord !== "" && _lastStatus !== rematchKey) {
          _lastStatus = rematchKey;
          emit("rematch_start", {
            word: rematchWord,
            players: Object.values(players),
          });
        }

        if (isHost && status !== "playing") {
          var rematchVotes = r.rematchVotes || {};
          var totalPlayers = Object.keys(players).length;
          var totalVotes = Object.keys(rematchVotes).filter(function (k) {
            return rematchVotes[k] === true;
          }).length;
          if (totalPlayers >= MIN_PLAYERS && totalVotes >= totalPlayers) {
            _doRematch();
          }
        }

        var rematchVotesCur = r.rematchVotes || {};
        var totalPl = Object.keys(players).length;
        var totalV = Object.keys(rematchVotesCur).filter(function (k) {
          return rematchVotesCur[k] === true;
        }).length;
        emit("rematch_votes_update", { votes: totalV, total: totalPl });
      });
    }, 1200);
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
      isBot: false,
      online: true,
    };
  }

  function createRoom(p) {
    p.id = p.id || genId();
    pid = p.id;
    isHost = true;
    _rematchStarted = false;
    var code = genCode();
    room = code;
    var data = {
      code: code,
      host: pid,
      status: "lobby",
      createdAt: Date.now(),
      players: {},
      currentWord: "",
      rematchWord: "",
      events: {},
      rematchVotes: {},
    };
    data.players[pid] = _entry(p);
    return dbSet("rooms/" + code, data).then(function () {
      players = {};
      players[pid] = _entry(p);
      _listenRoom(code);
      startPoll(code);
      window.addEventListener("beforeunload", function () {
        try {
          navigator.sendBeacon(
            FIREBASE_URL +
              "/rooms/" +
              code +
              "/players/" +
              pid +
              "/online.json",
            JSON.stringify(false),
          );
        } catch (x) {}
      });
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
      if (r.status === "playing") {
        Effects.showToast("GAME SEDANG BERLANGSUNG!", "error");
        return null;
      }
      var currentCount = r.players ? Object.keys(r.players).length : 0;
      if (currentCount >= MAX_PLAYERS) {
        Effects.showToast(
          "ROOM SUDAH PENUH! (MAKS " + MAX_PLAYERS + " PEMAIN)",
          "error",
        );
        return null;
      }
      p.id = p.id || genId();
      pid = p.id;
      isHost = false;
      room = code;
      _rematchStarted = false;
      return dbSet("rooms/" + code + "/players/" + pid, _entry(p))
        .then(function () {
          return dbGet("rooms/" + code + "/players");
        })
        .then(function (all) {
          players = all || {};
          _listenRoom(code);
          startPoll(code);
          window.addEventListener("beforeunload", function () {
            try {
              navigator.sendBeacon(
                FIREBASE_URL +
                  "/rooms/" +
                  code +
                  "/players/" +
                  pid +
                  "/online.json",
                JSON.stringify(false),
              );
            } catch (x) {}
          });
          return { roomCode: code, players: Object.values(players) };
        });
    });
  }

  function _listenRoom(code) {
    listen("rooms/" + code + "/players", function (data, path) {
      if (!data && path === "/") return;
      if (path === "/" || path === "") {
        if (data && typeof data === "object") {
          players = data;
          emit("players_update", { players: Object.values(players) });
          _updateLobby();
        }
      } else {
        var parts = path.replace(/^\//, "").split("/");
        var p2 = parts[0];
        if (!p2) return;
        if (data === null) {
          delete players[p2];
        } else if (typeof data === "object") {
          players[p2] = Object.assign({}, players[p2] || {}, data);
        } else if (parts.length > 1) {
          if (!players[p2]) players[p2] = {};
          players[p2][parts[1]] = data;
        }
        emit("players_update", { players: Object.values(players) });
        emit("player_progress", {
          playerId: p2,
          progress: (players[p2] && players[p2].progress) || 0,
          wpm: (players[p2] && players[p2].wpm) || 0,
        });
        emit("hp_update", {
          playerId: p2,
          hp:
            players[p2] && players[p2].hp !== undefined
              ? players[p2].hp
              : PLAYER_MAX_HP,
        });
        _updateLobby();
      }
    });
    listen("rooms/" + code + "/status", function (data) {
      if (data === "playing" && !isHost && _lastStatus !== "playing") {
        _lastStatus = "playing";
        dbGet("rooms/" + code + "/currentWord").then(function (w) {
          if (w)
            emit("game_start", { word: w, players: Object.values(players) });
        });
      }
    });
    listen("rooms/" + code + "/rematchWord", function (data) {
      if (data && data !== "") {
        var rematchKey = "rematch_" + data;
        if (_lastStatus !== rematchKey) {
          _lastStatus = rematchKey;
          emit("rematch_start", {
            word: data,
            players: Object.values(players),
          });
        }
      }
    });
    listen("rooms/" + code + "/events", function (data, path) {
      if (!data || path === "/" || path === "") return;
      if (typeof data === "object" && data.type && data.from !== pid)
        _handleEv(data);
    });
    listen("rooms/" + code + "/rematchVotes", function (data) {
      if (!data) return;
      var votes = data;
      var totalPlayers = Object.keys(players).length;
      var totalVotes = Object.keys(votes).filter(function (k) {
        return votes[k] === true;
      }).length;
      emit("rematch_votes_update", { votes: totalVotes, total: totalPlayers });
      if (isHost && totalPlayers >= MIN_PLAYERS && totalVotes >= totalPlayers) {
        _doRematch();
      }
    });
  }

  function _handleEv(ev) {
    if (ev.type === "typing")
      emit("player_typing", { playerId: ev.from, name: ev.name });
    if (ev.type === "word_complete")
      emit("player_word_complete", { playerId: ev.from, wpm: ev.wpm });
    if (ev.type === "damage")
      emit("damage_dealt", { from: ev.from, to: ev.to, amount: ev.amount });
  }

  function _updateLobby() {
    var grid = document.getElementById("lobbyPlayers");
    if (!grid) return;
    var playerList = Object.values(players);
    grid.innerHTML = playerList
      .map(function (p) {
        return (
          '<div class="lpc ready"><div class="lpc-avatar">' +
          (p.avatar || "⚡") +
          '</div><div class="lpc-name bb">' +
          p.name +
          (p.id === pid ? " (YOU)" : "") +
          '</div><div class="lpc-status" style="color:var(--g)">READY ✓</div></div>'
        );
      })
      .join("");
    var st = document.getElementById("lobbyStatus");
    if (st)
      st.textContent =
        playerList.length + "/" + MAX_PLAYERS + " PILOT(S) IN LOBBY";

    var startBtn = document.getElementById("btnStartMatch");
    if (startBtn && isHost) {
      var canStart = playerList.length >= MIN_PLAYERS;
      startBtn.disabled = !canStart;
      startBtn.title = canStart
        ? ""
        : "Butuh minimal " + MIN_PLAYERS + " pemain untuk mulai";
      startBtn.style.opacity = canStart ? "1" : "0.4";
    }
  }

  function startGame() {
    if (!isHost || !room) return Promise.resolve();
    var playerList = Object.values(players);
    if (playerList.length < MIN_PLAYERS) {
      Effects.showToast("Butuh minimal " + MIN_PLAYERS + " pemain!", "error");
      return Promise.resolve();
    }
    _rematchStarted = false;
    var word = Words.getByWave(1);
    return dbUpd("rooms/" + room, {
      status: "playing",
      currentWord: word,
      rematchWord: "",
      rematchVotes: null,
      startedAt: Date.now(),
    }).then(function () {
      _lastStatus = "playing";
      emit("game_start", { word: word, players: Object.values(players) });
    });
  }

  function voteRematch() {
    if (!room || !pid) return Promise.resolve();
    return dbSet("rooms/" + room + "/rematchVotes/" + pid, true);
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    var word = Words.getByWave(1);
    Object.values(players).forEach(function (p) {
      p.hp = PLAYER_MAX_HP;
      p.wpm = 0;
      p.progress = 0;
    });
    var newRematchKey = "rematch_" + word;
    var updates = {
      status: "playing",
      currentWord: word,
      rematchWord: word,
      rematchVotes: null,
      startedAt: Date.now(),
    };
    Object.values(players).forEach(function (p) {
      updates["players/" + p.id + "/hp"] = PLAYER_MAX_HP;
      updates["players/" + p.id + "/wpm"] = 0;
      updates["players/" + p.id + "/progress"] = 0;
    });
    return dbUpd("rooms/" + room, updates).then(function () {
      _lastStatus = newRematchKey;
      emit("rematch_start", { word: word, players: Object.values(players) });
    });
  }

  function sendProgress(progress, wpm) {
    if (!room || !pid) return Promise.resolve();
    if (players[pid]) {
      players[pid].progress = progress;
      players[pid].wpm = wpm;
    }
    emit("player_progress", { playerId: pid, progress: progress, wpm: wpm });
    return dbUpd("rooms/" + room + "/players/" + pid, {
      progress: progress,
      wpm: wpm,
    });
  }

  function sendTyping() {
    if (!room || !pid) return Promise.resolve();
    emit("player_typing", {
      playerId: pid,
      name: players[pid] && players[pid].name,
    });
    var id = Date.now().toString(36);
    return dbSet("rooms/" + room + "/events/" + id, {
      type: "typing",
      from: pid,
      name: (players[pid] && players[pid].name) || "?",
      ts: Date.now(),
    });
  }

  function sendDamage(targetId, amount) {
    if (!room || !pid) return Promise.resolve();
    var id = Date.now().toString(36) + "_d";
    return dbSet("rooms/" + room + "/events/" + id, {
      type: "damage",
      from: pid,
      to: targetId,
      amount: amount,
      ts: Date.now(),
    });
  }

  function updatePlayerHp(playerId, hp) {
    if (!room) return Promise.resolve();
    var safeHp = Math.max(0, Math.min(PLAYER_MAX_HP, hp));
    if (players[playerId]) players[playerId].hp = safeHp;
    emit("hp_update", { playerId: playerId, hp: safeHp });
    return dbUpd("rooms/" + room + "/players/" + playerId, { hp: safeHp });
  }

  function leaveRoom() {
    stopBots();
    stopListeners();
    if (room && pid) {
      dbDel("rooms/" + room + "/players/" + pid);
      if (isHost) dbDel("rooms/" + room);
    }
    room = null;
    players = {};
    isHost = false;
    _lastStatus = "";
    _lastSnap = "";
    _rematchVotes = {};
    _rematchStarted = false;
    emit("left_room", {});
    return Promise.resolve();
  }

  function startBotSimulation(word) {
    _bots.forEach(clearInterval);
    _bots = [];
    Object.values(players).forEach(function (p) {
      if (!p.isBot) return;
      var idx = 0,
        total = word.replace(/ /g, "").length || 1;
      var baseDelay = Math.floor(1000 / (p.speed * 4));
      var iv = setInterval(
        function () {
          if (idx >= total) {
            clearInterval(iv);
            emit("player_word_complete", {
              playerId: p.id,
              wpm: Math.floor(p.speed * 60),
            });
            return;
          }
          idx++;
          p.progress = idx / total;
          p.wpm = Math.floor(p.speed * 50 + Math.random() * 20);
          emit("player_progress", {
            playerId: p.id,
            progress: p.progress,
            wpm: p.wpm,
          });
        },
        baseDelay + Math.random() * 200,
      );
      _bots.push(iv);
    });
  }

  function stopBots() {
    _bots.forEach(clearInterval);
    _bots = [];
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

  return {
    on,
    generatePlayerId,
    createRoom,
    joinRoom,
    startGame,
    voteRematch,
    startRematch,
    startBotSimulation,
    stopBots,
    sendProgress,
    sendTyping,
    sendDamage,
    updatePlayerHp,
    leaveRoom,
    getPlayers,
    getPlayer,
    getCurrentRoom,
    getIsHost,
    getPlayerId,
    getMinPlayers,
    getMaxPlayers,
  };
})();
