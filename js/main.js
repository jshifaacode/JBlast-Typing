var App = (function () {
  var profile = null;
  var KEY = "keystorm_v2";
  var _mpRoomCode = null;
  var _mpIsHost = false;
  var _inMpGame = false;

  function getProfile() {
    if (!profile) {
      var s = localStorage.getItem(KEY);
      profile = s
        ? JSON.parse(s)
        : {
            name: "",
            avatar: "⚡",
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
      }
      setTimeout(function () {
        if (inp) inp.focus();
      }, 200);
    }
  }

  function startSolo() {
    var p = getProfile();
    _inMpGame = false;
    UI.showScreen("screen-game");
    _setupGameScreen();
    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "none";
    Game.init("solo", p.skin);
  }

  function startMpGame(firstWord) {
    if (_inMpGame) return;
    _inMpGame = true;
    var p = getProfile();
    UI.showScreen("screen-game");
    _setupGameScreen();
    Game.init("multiplayer", p.skin, firstWord);
    Game.setupMultiplayer();
    setTimeout(function () {
      _inMpGame = false;
    }, 2000);
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
      grid.innerHTML = players
        .map(function (p) {
          return (
            '<div class="lpc ready"><div class="lpc-avatar">' +
            (p.avatar || "⚡") +
            '</div><div class="lpc-name bb">' +
            p.name +
            '</div><div class="lpc-status" style="color:var(--g)">READY ✓</div></div>'
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

  function _updateRematchStatus(votes, total) {
    var el = document.getElementById("rematchStatus");
    if (!el) return;
    if (votes > 0 && votes < total) {
      el.style.display = "block";
      el.textContent =
        "Voting rematch: " + votes + "/" + total + " pemain siap...";
    } else if (votes >= total && total >= 2) {
      el.style.display = "block";
      el.textContent = "Semua siap! Memulai rematch...";
    } else {
      el.style.display = "none";
      el.textContent = "";
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
      var avatar = selAv ? selAv.dataset.avatar : "⚡";
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
      if (bgmBtn) bgmBtn.textContent = "♪ BGM: " + (muted ? "OFF" : "ON");
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
        buildLobby(r.players, true, r.roomCode);
        UI.showScreen("screen-lobby");
        Effects.showToast("Room dibuat! Share kode ke teman.", "success");
        Multiplayer.on("game_start", function (data) {
          GameAudio.playBgm();
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_start", function (data) {
          GameAudio.playBgm();
          _updateRematchStatus(0, 0);
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_votes_update", function (data) {
          _updateRematchStatus(data.votes, data.total);
        });
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
        buildLobby(r.players, false, r.roomCode);
        UI.showScreen("screen-lobby");
        Effects.showToast(
          "Joined " + r.roomCode + "! Tunggu host start.",
          "success",
        );
        Multiplayer.on("game_start", function (data) {
          GameAudio.playBgm();
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_start", function (data) {
          GameAudio.playBgm();
          _updateRematchStatus(0, 0);
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_votes_update", function (data) {
          _updateRematchStatus(data.votes, data.total);
        });
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
      GameAudio.playBgm();
      Multiplayer.startGame().then(function () {
        startMpGame();
      });
    });

    addTap("btnLeaveLobby", function () {
      Multiplayer.leaveRoom().then(function () {
        _mpRoomCode = null;
        _mpIsHost = false;
        GameAudio.stopBgm(false);
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
      var active = document.querySelector(".screen.active");
      if (active && active.id === "screen-game" && !isMobile()) {
        var inp = document.getElementById("gameInput");
        if (inp && document.activeElement !== inp) inp.focus();
      }
    });

    addTap("btnPlayAgain", function () {
      var st = Game.getState();
      if (st.mode === "multiplayer") {
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
        Multiplayer.voteRematch().then(function () {
          var allPlayers = Multiplayer.getPlayers();
          if (allPlayers.length < Multiplayer.getMinPlayers()) {
            if (_mpIsHost) {
              Multiplayer.startRematch().then(function () {
                GameAudio.playBgm();
                startMpGame();
              });
            }
          }
        });
      } else {
        GameAudio.playBgm();
        startSolo();
      }
    });

    addTap("btnBackToMenu", function () {
      GameAudio.stopBgm(true);
      var rsEl = document.getElementById("rematchStatus");
      if (rsEl) rsEl.style.display = "none";
      var btnPlay = document.getElementById("btnPlayAgain");
      if (btnPlay) {
        btnPlay.disabled = false;
        btnPlay.textContent = "MAIN LAGI";
      }
      if (Game.getState().mode === "multiplayer") {
        Multiplayer.leaveRoom().then(function () {
          _mpRoomCode = null;
          _mpIsHost = false;
          UI.updateMenuDisplay(getProfile());
          UI.showScreen("screen-menu");
        });
      } else {
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
