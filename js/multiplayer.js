var FIREBASE_URL = "https://jblast-typing-default-rtdb.firebaseio.com";

var Multiplayer = (function () {
  var room = null,
    pid = null,
    isHost = false;
  var players = {};
  var cbs = {};
  var _poll = null;
  var POLL_MS = 180;
  var PLAYER_MAX_HP = 200,
    MAX_PLAYERS = 4,
    MIN_PLAYERS = 2;

  var _lastStatus = "";
  var _lastGameOver = "";
  var _lastRematchSig = "";
  var _lastPlayerSnap = "";
  var _lastVoteSnap = "";
  var _lastDmgSnap = "";
  var _processedEvents = {};
  var _processedDmg = {};
  var _rematchStarted = false;
  var _doingRematch = false;
  var _gameOverBroadcasted = false;

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
    _lastVoteSnap = "";
    _lastDmgSnap = "";
    _processedEvents = {};
    _processedDmg = {};
    _rematchStarted = false;
    _doingRematch = false;
    _gameOverBroadcasted = false;
  }

  function stopPoll() {
    if (_poll) {
      clearInterval(_poll);
      _poll = null;
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

  function _checkAndBroadcastWinner(fp) {
    if (!isHost || !room) return;
    if (_gameOverBroadcasted) return;
    if (_lastStatus !== "playing") return;

    var allP = Object.values(fp || players);
    if (allP.length < MIN_PLAYERS) return;

    var alive = allP.filter(function (p) {
      return (p.hp || 0) > 0;
    });

    if (alive.length <= 1) {
      _gameOverBroadcasted = true;
      var winnerId = alive.length === 1 ? alive[0].id : null;
      var val = winnerId || "none";
      _lastGameOver = val;
      dbUpd("rooms/" + room, { gameOver: val, status: "ended" });
    }
  }

  function _hostApplyDamage(dmgEvents) {
    if (!isHost || !room) return;
    var now = Date.now();
    var changed = false;
    Object.keys(dmgEvents).forEach(function (k) {
      var ev = dmgEvents[k];
      if (!ev || !ev.ts || !ev.targetId || !ev.amount) return;
      if (now - ev.ts > 8000) return;
      if (_processedDmg[k]) return;
      _processedDmg[k] = true;
      var target = players[ev.targetId];
      if (!target) return;
      var newHp = Math.max(0, (target.hp || 0) - ev.amount);
      target.hp = newHp;
      changed = true;
    });
    if (!changed) return;
    var updates = {};
    Object.keys(players).forEach(function (id) {
      updates["players/" + id + "/hp"] = players[id].hp;
    });
    dbUpd("rooms/" + room, updates).then(function () {
      dbGet("rooms/" + room + "/players").then(function (fp) {
        if (fp) {
          players = fp;
          _checkAndBroadcastWinner(fp);
        }
      });
    });
    dbSet("rooms/" + room + "/dmgEvents", null);
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

        var dmgEvs = r.dmgEvents || {};
        var dmgSnap = JSON.stringify(dmgEvs);
        if (dmgSnap !== _lastDmgSnap && Object.keys(dmgEvs).length > 0) {
          _lastDmgSnap = dmgSnap;
          if (isHost && _lastStatus === "playing") {
            _hostApplyDamage(dmgEvs);
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
          _lastVoteSnap = "";
          _lastDmgSnap = "";
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
          _lastVoteSnap = "";
          _lastDmgSnap = "";
          emit("rematch_start", {
            word: r.rematchWord,
            players: Object.values(players),
          });
        }

        var goVal = r.gameOver || "";
        if (goVal !== "" && goVal !== _lastGameOver) {
          _lastGameOver = goVal;
          if (status !== "lobby") {
            var goWin = goVal === "none" ? null : goVal;
            var goPl = r.players
              ? Object.values(r.players)
              : Object.values(players);
            emit("game_over", { winnerId: goWin, players: goPl });
          }
        }

        var rv = r.rematchVotes || {};
        var vSnap = JSON.stringify(rv);
        if (vSnap !== _lastVoteSnap) {
          _lastVoteSnap = vSnap;
          var pIds = Object.keys(players);
          if (pIds.length >= MIN_PLAYERS && Object.keys(rv).length > 0) {
            _handleRematchVotes(rv, pIds);
          }
        }

        var evs = r.events || {};
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
      dmgEvents: {},
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
    _lastVoteSnap = "";
    _lastDmgSnap = "";
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
      dmgEvents: {},
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
    _lastStatus = "playing";
    return dbUpd("rooms/" + room, updates);
  }

  function startRematch() {
    if (!isHost || !room) return Promise.resolve();
    _processedEvents = {};
    _processedDmg = {};
    _gameOverBroadcasted = false;
    _lastVoteSnap = "";
    _lastDmgSnap = "";
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
        dmgEvents: {},
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
      return dbUpd("rooms/" + room, updates);
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
    return dbSet("rooms/" + room + "/players/" + pid + "/hp", safe).then(
      function () {
        if (safe === 0 && isHost) {
          dbGet("rooms/" + room + "/players").then(function (fp) {
            if (fp) {
              players = fp;
              _checkAndBroadcastWinner(fp);
            }
          });
        } else if (safe === 0 && !isHost) {
          dbGet("rooms/" + room + "/players").then(function (fp) {
            if (fp) {
              players = fp;
              var alive = Object.values(fp).filter(function (p) {
                return (p.hp || 0) > 0;
              });
              if (alive.length <= 1) {
                broadcastGameOver(alive.length === 1 ? alive[0].id : null);
              }
            }
          });
        }
      },
    );
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

  function dealDamageToOpponent(targetId, amount) {
    if (!room || !pid) return Promise.resolve();
    var evId = pid + "_" + Date.now().toString(36);
    return dbSet("rooms/" + room + "/dmgEvents/" + evId, {
      from: pid,
      targetId: targetId,
      amount: amount,
      ts: Date.now(),
    });
  }

  function broadcastGameOver(winnerId) {
    if (!room) return Promise.resolve();
    var val = winnerId || "none";
    if (_lastGameOver === val) return Promise.resolve();
    _gameOverBroadcasted = true;
    _lastGameOver = val;
    return dbUpd("rooms/" + room, { gameOver: val, status: "ended" });
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
    dealDamageToOpponent,
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
