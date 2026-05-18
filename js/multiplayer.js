var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null,
    pid = null,
    isHost = false,
    players = {},
    cbs = {};
  var _poll = null;
  var _rematchStarted = false,
    _doingRematch = false;
  var _lastGameOver = "",
    _lastStatus = "",
    _lastRematchSig = "",
    _lastPlayerSnap = "",
    _lastEventSnap = "";
  var PLAYER_MAX_HP = 200,
    MAX_PLAYERS = 4,
    MIN_PLAYERS = 2;
  var POLL_INTERVAL = 400;

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
    var url = FIREBASE_URL + "/" + path + ".json";
    var fetchOpts = opts || {};
    fetchOpts.cache = "no-store";
    return fetch(url, fetchOpts)
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

  function stopPoll() {
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
    }
  }

  function _resetPollState() {
    _lastGameOver = "";
    _lastStatus = "";
    _lastRematchSig = "";
    _lastPlayerSnap = "";
    _lastEventSnap = "";
  }

  function _doRematch() {
    if (!isHost || _rematchStarted || _doingRematch) return;
    _doingRematch = true;
    _rematchStarted = true;
    dbUpd("rooms/" + room, { rematchVotes: null }).then(function () {
      startRematch();
    });
  }

  function _handleRematchVotes(votes) {
    if (!votes) votes = {};
    var playerIds = Object.keys(players);
    var totalPlayers = playerIds.length;
    if (totalPlayers < MIN_PLAYERS) return;
    var totalAccept = playerIds.filter(function (k) {
      return votes[k] === true;
    }).length;
    var hasDecline = playerIds.some(function (k) {
      return votes[k] === false;
    });
    emit("rematch_votes_update", {
      votes: totalAccept,
      total: totalPlayers,
      voteMap: votes,
      hasDecline: hasDecline,
    });
    if (hasDecline) return;
    if (
      isHost &&
      totalPlayers >= MIN_PLAYERS &&
      totalAccept >= totalPlayers &&
      !_rematchStarted &&
      !_doingRematch
    ) {
      _doRematch();
    }
  }

  function startPoll(code) {
    stopPoll();
    _resetPollState();

    _poll = setInterval(function () {
      dbGet("rooms/" + code).then(function (r) {
        if (!r) return;

        var freshPlayers = r.players || {};
        var snap = JSON.stringify(freshPlayers);
        if (snap !== _lastPlayerSnap) {
          _lastPlayerSnap = snap;
          players = freshPlayers;
          emit("players_update", { players: Object.values(players) });
          _updateLobby();
        }

        var status = r.status || "lobby";

        if (status === "playing" && _lastStatus !== "playing") {
          _lastStatus = "playing";
          _rematchStarted = false;
          _doingRematch = false;
          if (r.currentWord) {
            emit("game_start", {
              word: r.currentWord,
              players: Object.values(players),
            });
          }
        }

        var rematchSig =
          (r.rematchWord || "") + "|" + (r.rematchStartedAt || "");
        if (
          r.rematchWord &&
          r.rematchWord !== "" &&
          rematchSig !== _lastRematchSig &&
          _lastStatus === "playing"
        ) {
          _lastRematchSig = rematchSig;
          _lastStatus = "rematch";
          _doingRematch = false;
          _rematchStarted = false;
          emit("rematch_start", {
            word: r.rematchWord,
            players: Object.values(players),
          });
        }

        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver) {
          _lastGameOver = goVal;
          var goWin = goVal === "none" ? null : goVal;
          var goPl = r.players
            ? Object.values(r.players)
            : Object.values(players);
          emit("game_over", { winnerId: goWin, players: goPl });
        }

        var rv = r.rematchVotes || {};
        var totalPl = Object.keys(players).length;
        var hasAnyVote = Object.keys(rv).length > 0;
        if (totalPl >= MIN_PLAYERS && hasAnyVote) {
          _handleRematchVotes(rv);
        }

        var evSnap = JSON.stringify(r.events || {});
        if (evSnap !== _lastEventSnap) {
          _lastEventSnap = evSnap;
          var events = r.events || {};
          var now = Date.now();
          Object.values(events).forEach(function (ev) {
            if (!ev || !ev.ts || now - ev.ts > 3000) return;
            if (ev.type === "typing" && ev.from !== pid) {
              emit("player_typing", { playerId: ev.from, name: ev.name });
            }
            if (ev.type === "damage" && ev.to === pid) {
              emit("damage_dealt", {
                from: ev.from,
                to: ev.to,
                amount: ev.amount,
              });
            }
          });
        }
      });
    }, POLL_INTERVAL);
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
    _doingRematch = false;
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
      rematchStartedAt: 0,
      gameOver: "",
      events: {},
      rematchVotes: {},
    };
    data.players[pid] = _entry(p);
    return dbSet("rooms/" + code, data).then(function () {
      players = {};
      players[pid] = _entry(p);
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
      _doingRematch = false;
      return dbSet("rooms/" + code + "/players/" + pid, _entry(p))
        .then(function () {
          return dbGet("rooms/" + code + "/players");
        })
        .then(function (all) {
          players = all || {};
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

  function _updateLobby() {
    var playerList = Object.values(players);
    var lobbyGrid = document.getElementById("lobbyPlayers");
    if (!lobbyGrid) return;
    var myId = pid;
    lobbyGrid.innerHTML = playerList
      .map(function (p) {
        var isMe = p.id === myId;
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
    var st = document.getElementById("lobbyStatus");
    if (st)
      st.textContent =
        playerList.length + "/" + MAX_PLAYERS + " PILOT(S) IN LOBBY";
    var startBtn = document.getElementById("btnStartMatch");
    if (startBtn) {
      if (isHost) {
        var canStart = playerList.length >= MIN_PLAYERS;
        startBtn.disabled = !canStart;
        startBtn.style.opacity = canStart ? "1" : "0.4";
        startBtn.style.pointerEvents = canStart ? "auto" : "none";
        startBtn.style.display = "block";
      } else {
        startBtn.style.display = "none";
      }
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

  function startGame() {
    if (!isHost || !room) return Promise.resolve();
    var playerList = Object.values(players);
    if (playerList.length < MIN_PLAYERS) {
      Effects.showToast("Butuh minimal " + MIN_PLAYERS + " pemain!", "error");
      return Promise.resolve();
    }
    _rematchStarted = false;
    _doingRematch = false;
    _lastGameOver = "";
    _lastRematchSig = "";
    var word = Words.getByWave(1);
    _lastStatus = "playing";

    var resetUpdates = {
      status: "playing",
      currentWord: word,
      rematchWord: "",
      rematchStartedAt: 0,
      gameOver: "",
      rematchVotes: null,
      startedAt: Date.now(),
    };
    playerList.forEach(function (p) {
      resetUpdates["players/" + p.id + "/hp"] = PLAYER_MAX_HP;
      resetUpdates["players/" + p.id + "/wpm"] = 0;
      resetUpdates["players/" + p.id + "/progress"] = 0;
      if (players[p.id]) {
        players[p.id].hp = PLAYER_MAX_HP;
        players[p.id].wpm = 0;
        players[p.id].progress = 0;
      }
    });

    return dbUpd("rooms/" + room, resetUpdates).then(function () {
      emit("game_start", { word: word, players: Object.values(players) });
    });
  }

  function voteRematch(accept) {
    if (!room || !pid) return Promise.resolve();
    var val = accept === false ? false : true;
    return dbSet("rooms/" + room + "/rematchVotes/" + pid, val);
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    var word = Words.getByWave(1);
    var ts = Date.now();
    var updates = {
      status: "playing",
      currentWord: word,
      rematchWord: word,
      rematchStartedAt: ts,
      gameOver: "",
      rematchVotes: null,
      startedAt: ts,
    };
    return dbGet("rooms/" + room + "/players").then(function (latestPlayers) {
      var allPlayers = latestPlayers || players;
      Object.keys(allPlayers).forEach(function (id) {
        updates["players/" + id + "/hp"] = PLAYER_MAX_HP;
        updates["players/" + id + "/wpm"] = 0;
        updates["players/" + id + "/progress"] = 0;
        if (players[id]) {
          players[id].hp = PLAYER_MAX_HP;
          players[id].wpm = 0;
          players[id].progress = 0;
        }
      });
      _lastStatus = "rematch";
      _lastGameOver = "";
      _lastRematchSig = word + "|" + ts;
      return dbUpd("rooms/" + room, updates).then(function () {
        _doingRematch = false;
        emit("rematch_start", { word: word, players: Object.values(players) });
      });
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

  function broadcastGameOver(winnerId) {
    if (!room) return Promise.resolve();
    var val = winnerId || "none";
    if (_lastGameOver === val) return Promise.resolve();
    _lastGameOver = val;
    return dbUpd("rooms/" + room, { gameOver: val, status: "ended" });
  }

  function leaveRoom() {
    stopPoll();
    if (room && pid) {
      dbDel("rooms/" + room + "/players/" + pid);
      if (isHost) dbDel("rooms/" + room);
    }
    room = null;
    players = {};
    isHost = false;
    pid = null;
    _resetPollState();
    _rematchStarted = false;
    _doingRematch = false;
    return Promise.resolve();
  }

  function startBotSimulation(word) {
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
    });
  }

  function stopBots() {}

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
  };
})();
