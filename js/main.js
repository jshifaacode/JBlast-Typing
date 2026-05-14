var App = (function () {
  var profile = null;
  var KEY = "keystorm_v2";
  var _mpRoomCode = null;
  var _mpIsHost = false;
  var _inMpGame = false;
  var _mpReady = false;
  var _leavingGame = false;

  function getProfile() {
    if (!profile) {
      var s = localStorage.getItem(KEY);
      profile = s
        ? JSON.parse(s)
        : {
            name: "",
            avatar: "BOLT",
            skin: "default",
            xp: 0,
            level: 1,
            stats: {},
          };
    }
    return profile;
  }

  function saveProfile(p) {
    profile = p;
    localStorage.setItem(KEY, JSON.stringify(p));
  }

  function addTap(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    var fired = false;
    el.addEventListener(
      "touchend",
      function (e) {
        e.preventDefault();
        fired = true;
        GameAudio.unlock();
        fn();
      },
      { passive: false },
    );
    el.addEventListener("click", function () {
      if (fired) {
        fired = false;
        return;
      }
      GameAudio.unlock();
      fn();
    });
  }

  function bootSequence() {
    var lines = [
      "> JBLASTTYPING OS v3.0 LOADING...",
      "> NEURAL TYPING ENGINE: ONLINE",
      "> COMBAT PROTOCOLS: ACTIVATED",
      "> MULTIPLAYER STACK: READY",
      "> AUDIO SUBSYSTEM: INITIALIZED",
      "> ENEMY WAVES INCOMING...",
      "> SELAMAT DATANG, PILOT.",
    ];
    var el = document.getElementById("bootLines");
    var btn = document.getElementById("btnEnterGame");
    var i = 0;
    function add() {
      if (i >= lines.length) {
        setTimeout(function () {
          if (btn) btn.style.display = "block";
        }, 300);
        return;
      }
      el.textContent += lines[i] + "\n";
      i++;
      setTimeout(add, 260 + Math.random() * 160);
    }
    add();
  }

  function _setupGameScreen() {
    var mobile = isMobile();
    var kb = document.getElementById("mobileKeyboard");
    var inp = document.getElementById("gameInput");
    if (mobile) {
      buildMobileKeyboard();
      if (inp) {
        inp.style.opacity = "0";
        inp.style.position = "absolute";
        inp.style.pointerEvents = "none";
        inp.style.width = "1px";
        inp.style.height = "1px";
      }
      if (kb) kb.style.display = "flex";
    } else {
      if (kb) kb.style.display = "none";
      if (inp) {
        inp.style.opacity = "";
        inp.style.position = "";
        inp.style.pointerEvents = "";
        inp.style.width = "";
        inp.style.height = "";
        inp.disabled = false;
      }
      setTimeout(function () {
        if (inp && !_leavingGame) inp.focus();
      }, 200);
    }
  }

  function startSolo() {
    _leavingGame = false;
    _inMpGame = false;
    var p = getProfile();
    UI.showScreen("screen-game");
    _setupGameScreen();
    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "none";
    Game.init("solo", p.skin);
  }

  function startMpGame(firstWord) {
    if (_inMpGame) return;
    _inMpGame = true;
    _leavingGame = false;

    var inp = document.getElementById("gameInput");
    if (inp) inp.disabled = false;
    document.querySelectorAll(".key-btn").forEach(function (b) {
      b.disabled = false;
    });
    document.querySelectorAll(".skill-btn").forEach(function (b) {
      b.disabled = true;
    });
    var wordPanel = document.querySelector(".word-panel");
    if (wordPanel) {
      wordPanel.style.opacity = "";
      wordPanel.style.pointerEvents = "";
    }

    var p = getProfile();
    UI.showScreen("screen-game");
    _setupGameScreen();
    Game.init("multiplayer", p.skin, firstWord);
    Game.setupMultiplayer();
    GameAudio.playBgm();
    setTimeout(function () {
      _inMpGame = false;
    }, 3000);
  }

  function _updateRematchStatus(votes, total) {
    var el = document.getElementById("rematchStatus");
    if (!el) return;
    if (total < 2) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    if (votes >= total) {
      el.style.display = "block";
      el.textContent = "Semua siap! Memulai rematch...";
    } else if (votes > 0) {
      el.style.display = "block";
      el.textContent =
        "Voting rematch: " + votes + "/" + total + " pemain siap...";
    } else {
      el.style.display = "none";
      el.textContent = "";
    }
  }

  function _setupMpListeners() {
    Multiplayer.on("game_start", function (data) {
      if (_leavingGame) return;
      startMpGame(data.word);
    });
    Multiplayer.on("rematch_start", function (data) {
      if (_leavingGame) return;
      _updateRematchStatus(0, 0);
      _mpReady = true;
      var btnPlay = document.getElementById("btnPlayAgain");
      if (btnPlay) {
        btnPlay.disabled = false;
        btnPlay.textContent = "MAIN LAGI";
      }
      var rsEl = document.getElementById("rematchStatus");
      if (rsEl) rsEl.style.display = "none";
      startMpGame(data.word);
    });
    Multiplayer.on("rematch_votes_update", function (data) {
      _updateRematchStatus(data.votes, data.total);
    });
  }

  function buildLobby(players, isHost, roomCode) {
    var lobbyCode = document.getElementById("lobbyCode");
    var btnStart = document.getElementById("btnStartMatch");
    var lobbyStatus = document.getElementById("lobbyStatus");
    var grid = document.getElementById("lobbyPlayers");
    if (lobbyCode) lobbyCode.textContent = roomCode;
    if (btnStart) btnStart.style.display = isHost ? "block" : "none";
    if (lobbyStatus)
      lobbyStatus.textContent =
        players.length +
        "/" +
        Multiplayer.getMaxPlayers() +
        " PILOT(S) IN LOBBY";
    if (grid) {
      var myId = Multiplayer.getPlayerId();
      grid.innerHTML = players
        .map(function (p) {
          var isMe = p.id === myId;
          return (
            '<div class="lpc ready">' +
            '<div class="lpc-avatar">' +
            Multiplayer.getRenderAvatar()(p.avatar) +
            "</div>" +
            '<div class="lpc-name bb">' +
            p.name +
            (isMe ? " (YOU)" : "") +
            "</div>" +
            '<div class="lpc-status" style="color:var(--g)">READY</div>' +
            "</div>"
          );
        })
        .join("");
    }
    if (isHost && btnStart) {
      var canStart = players.length >= Multiplayer.getMinPlayers();
      btnStart.disabled = !canStart;
      btnStart.style.opacity = canStart ? "1" : "0.4";
    }
  }

  function showHowToPlay() {
    var modal = document.getElementById("howToPlayModal");
    if (modal) {
      modal.style.display = "flex";
      setTimeout(function () {
        modal.classList.add("active");
      }, 10);
    }
  }

  function hideHowToPlay() {
    var modal = document.getElementById("howToPlayModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(function () {
        modal.style.display = "none";
      }, 300);
    }
  }

  function bindEvents() {
    addTap("btnEnterGame", function () {
      GameAudio.keyPress();
      var p = getProfile();
      if (p.name) {
        UI.updateMenuDisplay(p);
        UI.showScreen("screen-menu");
      } else {
        UI.showScreen("screen-login");
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
      }
    });

    addTap("btnConfirmLogin", function () {
      var name = (document.getElementById("inputUsername").value || "").trim();
      if (!name) {
        Effects.showToast("Masukkan callsign dulu!", "error");
        return;
      }
      var selAv = document.querySelector(".avatar-item.selected");
      var avatar = selAv ? selAv.dataset.avatar : "BOLT";
      var selSk = document.querySelector(".skin-opt.selected");
      var skin = selSk ? selSk.dataset.skin : "default";
      var p = getProfile();
      p.name = name;
      p.avatar = avatar;
      p.skin = skin;
      saveProfile(p);
      UI.updateMenuDisplay(p);
      GameAudio.wordComplete();
      UI.showScreen("screen-menu");
    });

    document
      .getElementById("inputUsername")
      .addEventListener("keydown", function (e) {
        if (e.key === "Enter")
          document.getElementById("btnConfirmLogin").click();
      });

    addTap("btnSolo", function () {
      GameAudio.playBgm();
      GameAudio.keyPress();
      startSolo();
    });

    addTap("btnMultiplayer", function () {
      GameAudio.keyPress();
      UI.showScreen("screen-multiplayer");
    });

    addTap("btnHowToPlay", function () {
      GameAudio.keyPress();
      showHowToPlay();
    });

    addTap("btnCloseHowToPlay", function () {
      hideHowToPlay();
    });

    document
      .getElementById("howToPlayModal")
      .addEventListener("click", function (e) {
        if (e.target === this) hideHowToPlay();
      });

    addTap("btnStats", function () {
      GameAudio.keyPress();
      var p = getProfile();
      UI.buildStats(p.stats || {});
      UI.showScreen("screen-stats");
    });

    addTap("btnBackFromMP", function () {
      UI.showScreen("screen-menu");
    });
    addTap("btnBackFromStats", function () {
      UI.showScreen("screen-menu");
    });

    addTap("btnEditProfile", function () {
      GameAudio.keyPress();
      var p = getProfile();
      UI.showScreen("screen-login");
      UI.buildAvatarGrid();
      UI.buildSkinOptions();
      var inp = document.getElementById("inputUsername");
      if (inp) inp.value = p.name || "";
      setTimeout(function () {
        var ca = document.querySelector(
          '.avatar-item[data-avatar="' + p.avatar + '"]',
        );
        if (ca) {
          document.querySelectorAll(".avatar-item").forEach(function (o) {
            o.classList.remove("selected");
          });
          ca.classList.add("selected");
        }
        var cs = document.querySelector(
          '.skin-opt[data-skin="' + p.skin + '"]',
        );
        if (cs) {
          document.querySelectorAll(".skin-opt").forEach(function (o) {
            o.classList.remove("selected");
          });
          cs.classList.add("selected");
        }
      }, 60);
    });

    addTap("btnLogout", function () {
      GameAudio.keyPress();
      if (confirm("Logout dan hapus profil kamu?")) {
        localStorage.removeItem(KEY);
        profile = null;
        UI.showScreen("screen-login");
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
        document.getElementById("inputUsername").value = "";
      }
    });

    addTap("btnToggleBgm", function () {
      var muted = !GameAudio.isMuted();
      GameAudio.setMuted(muted);
      var bgmBtn = document.getElementById("btnToggleBgm");
      if (bgmBtn)
        bgmBtn.innerHTML =
          '<i class="fa-solid fa-music"></i> BGM: ' + (muted ? "OFF" : "ON");
      if (!muted && !GameAudio.isPlaying()) GameAudio.playBgm();
      Effects.showToast("BGM " + (muted ? "OFF" : "ON"), "info", 1200);
    });

    addTap("btnCreateRoom", function () {
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      var btnCreate = document.getElementById("btnCreateRoom");
      btnCreate.disabled = true;
      btnCreate.textContent = "CREATING...";
      _setupMpListeners();
      Multiplayer.createRoom({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      }).then(function (r) {
        btnCreate.disabled = false;
        btnCreate.textContent = "CREATE ROOM";
        if (!r) {
          Effects.showToast("Gagal buat room!", "error");
          return;
        }
        _mpRoomCode = r.roomCode;
        _mpIsHost = true;
        _mpReady = true;
        buildLobby(r.players, true, r.roomCode);
        UI.showScreen("screen-lobby");
        Effects.showToast("Room dibuat! Share kode ke teman.", "success");
        Multiplayer.on("players_update", function (data) {
          buildLobby(data.players, true, r.roomCode);
        });
      });
    });

    addTap("btnJoinRoom", function () {
      var code = (document.getElementById("inputRoomCode").value || "")
        .trim()
        .toUpperCase();
      if (code.length < 4) {
        Effects.showToast("Kode minimal 4 karakter!", "error");
        return;
      }
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      var btnJoin = document.getElementById("btnJoinRoom");
      btnJoin.disabled = true;
      btnJoin.textContent = "JOINING...";
      _setupMpListeners();
      Multiplayer.joinRoom(code, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      }).then(function (r) {
        btnJoin.disabled = false;
        btnJoin.textContent = "JOIN ROOM";
        if (!r) return;
        _mpRoomCode = r.roomCode;
        _mpIsHost = false;
        _mpReady = true;
        buildLobby(r.players, false, r.roomCode);
        UI.showScreen("screen-lobby");
        Effects.showToast(
          "Joined " + r.roomCode + "! Tunggu host start.",
          "success",
        );
        Multiplayer.on("players_update", function (data) {
          buildLobby(data.players, false, r.roomCode);
        });
      });
    });

    document
      .getElementById("inputRoomCode")
      .addEventListener("input", function () {
        this.value = this.value.toUpperCase();
      });

    addTap("btnCopyCode", function () {
      var code = document.getElementById("lobbyCode").textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).catch(function () {});
      } else {
        var ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      Effects.showToast("Kode disalin: " + code, "success");
    });

    addTap("btnStartMatch", function () {
      var playerCount = Multiplayer.getPlayers().length;
      if (playerCount < Multiplayer.getMinPlayers()) {
        Effects.showToast(
          "Butuh minimal " + Multiplayer.getMinPlayers() + " pemain!",
          "error",
        );
        return;
      }
      Multiplayer.startGame().then(function () {
        var word = null;
        var players = Multiplayer.getPlayers();
        startMpGame(word);
      });
    });

    addTap("btnLeaveLobby", function () {
      _mpReady = false;
      _leavingGame = true;
      Multiplayer.leaveRoom().then(function () {
        _mpRoomCode = null;
        _mpIsHost = false;
        GameAudio.stopBgm(false);
        _leavingGame = false;
        UI.showScreen("screen-menu");
      });
    });

    var gameInp = document.getElementById("gameInput");
    if (gameInp) {
      gameInp.addEventListener("input", function (e) {
        Game.handleInput(e);
      });
      gameInp.addEventListener("keydown", function (e) {
        if (e.key === "Backspace") {
          e.preventDefault();
          Game.handleVirtualKey("BACK");
        }
      });
    }

    document.querySelectorAll(".skill-btn").forEach(function (btn) {
      function act(e) {
        e.preventDefault();
        GameAudio.unlock();
        var sk = btn.dataset.skill;
        if (sk) Game.activateSkill(sk);
      }
      btn.addEventListener("click", act);
      btn.addEventListener("touchend", act, { passive: false });
    });

    document.addEventListener("keydown", function (e) {
      var active = document.querySelector(".screen.active");
      if (!active || active.id !== "screen-game") return;
      if (e.key === "1") Game.activateSkill("overdrive");
      if (e.key === "2") Game.activateSkill("freeze");
      if (e.key === "3") Game.activateSkill("burn");
    });

    document.addEventListener("keypress", function () {
      if (_leavingGame) return;
      var active = document.querySelector(".screen.active");
      if (active && active.id === "screen-game" && !isMobile()) {
        var inp = document.getElementById("gameInput");
        if (inp && document.activeElement !== inp && !inp.disabled) inp.focus();
      }
    });

    addTap("btnPlayAgain", function () {
      var st = Game.getState();
      if (st.mode === "multiplayer" && _mpReady) {
        var rsEl = document.getElementById("rematchStatus");
        if (rsEl) {
          rsEl.style.display = "block";
          rsEl.textContent = "Voting rematch...";
        }
        var btnPlay = document.getElementById("btnPlayAgain");
        if (btnPlay) {
          btnPlay.disabled = true;
          btnPlay.textContent = "MENUNGGU...";
        }
        Multiplayer.voteRematch();
      } else {
        GameAudio.playBgm();
        startSolo();
      }
    });

    addTap("btnBackToMenu", function () {
      _leavingGame = true;
      var inp = document.getElementById("gameInput");
      if (inp) inp.blur();
      GameAudio.stopBgm(true);
      var rsEl = document.getElementById("rematchStatus");
      if (rsEl) rsEl.style.display = "none";
      var btnPlay = document.getElementById("btnPlayAgain");
      if (btnPlay) {
        btnPlay.disabled = false;
        btnPlay.textContent = "MAIN LAGI";
      }
      var st = Game.getState();
      if (st.mode === "multiplayer" && _mpReady) {
        _mpReady = false;
        Multiplayer.leaveRoom().then(function () {
          _mpRoomCode = null;
          _mpIsHost = false;
          _leavingGame = false;
          UI.updateMenuDisplay(getProfile());
          UI.showScreen("screen-menu");
        });
      } else {
        _leavingGame = false;
        UI.updateMenuDisplay(getProfile());
        UI.showScreen("screen-menu");
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) GameAudio.pauseBgm();
      else GameAudio.resumeBgm();
    });
  }

  function initParticles() {
    var c = document.createElement("div");
    c.id = "particles";
    c.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2;pointer-events:none;overflow:hidden;";
    document.body.insertBefore(c, document.body.firstChild);
    for (var i = 0; i < 28; i++) {
      var p = document.createElement("div");
      var sz = Math.random() > 0.7 ? 3 : 2;
      var col = Math.random() > 0.5 ? "#00f5ff" : "#bf00ff";
      p.style.cssText =
        "position:absolute;width:" +
        sz +
        "px;height:" +
        sz +
        "px;left:" +
        Math.random() * 100 +
        "%;background:" +
        col +
        ";opacity:" +
        (0.2 + Math.random() * 0.4) +
        ";border-radius:0;animation:ptclUp " +
        (9 + Math.random() * 16) +
        "s linear " +
        Math.random() * 10 +
        "s infinite;";
      c.appendChild(p);
    }
    var style = document.createElement("style");
    style.textContent =
      "@keyframes ptclUp{0%{transform:translateY(110vh) rotate(0deg);opacity:0;}5%{opacity:.8;}95%{opacity:.6;}100%{transform:translateY(-10vh) rotate(720deg);opacity:0;}}";
    document.head.appendChild(style);
  }

  function init() {
    initParticles();
    bootSequence();
    bindEvents();
    UI.showScreen("screen-boot");
  }

  return { init: init, getProfile: getProfile, saveProfile: saveProfile };
})();

document.addEventListener("DOMContentLoaded", App.init);
