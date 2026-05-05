var App = (function () {
  var profile = null;
  var KEY = "keystorm_v2";
  var _mpRoomCode = null;
  var _mpIsHost = false;

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

  function _setupScreen(mob, inp, kb) {
    if (mob) {
      buildMobileKeyboard();
      if (inp) {
        inp.style.opacity = "0";
        inp.style.position = "absolute";
        inp.style.pointerEvents = "none";
      }
    } else {
      if (kb) kb.style.display = "none";
      if (inp) {
        inp.style.opacity = "";
        inp.style.position = "";
        inp.style.pointerEvents = "";
      }
      setTimeout(function () {
        if (inp) inp.focus();
      }, 140);
    }
  }

  function startSolo() {
    var p = getProfile();
    UI.showScreen("screen-game");
    var kb = document.getElementById("mobileKeyboard");
    var inp = document.getElementById("gameInput");
    _setupScreen(isMobile(), inp, kb);
    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "none";
    Audio.tryPlayPending();
    Audio.playBgm();
    Game.init("solo", p.skin);
  }

  function startMpGame(firstWord) {
    var st = Game.getState();
    if (
      document.getElementById("screen-game") &&
      document.getElementById("screen-game").classList.contains("active") &&
      st.running
    )
      return;

    var p = getProfile();
    UI.showScreen("screen-game");
    var kb = document.getElementById("mobileKeyboard");
    var inp = document.getElementById("gameInput");
    _setupScreen(isMobile(), inp, kb);
    Audio.tryPlayPending();
    Audio.playBgm();
    Game.init("multiplayer", p.skin, firstWord);
    Game.setupMultiplayer();
  }

  function buildLobby(players, isHost, roomCode) {
    function g(n) {
      return document.getElementById(n);
    }
    if (g("lobbyCode")) g("lobbyCode").textContent = roomCode;
    if (g("btnStartMatch"))
      g("btnStartMatch").style.display = isHost ? "block" : "none";
    if (g("lobbyStatus"))
      g("lobbyStatus").textContent = players.length + " PILOT(S) IN LOBBY";
    var grid = g("lobbyPlayers");
    if (grid) {
      grid.innerHTML = players
        .map(function (p) {
          return (
            '<div class="lpc ready"><div class="lpc-avatar">' +
            (p.avatar || "⚡") +
            '</div><div class="lpc-name bb">' +
            p.name +
            '</div><div class="lpc-status" style="color:var(--g)">READY</div></div>'
          );
        })
        .join("");
    }
  }

  function bindEvents() {
    function g(n) {
      return document.getElementById(n);
    }

    g("btnEnterGame").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
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

    g("btnConfirmLogin").addEventListener("click", function () {
      var name = (g("inputUsername").value || "").trim();
      if (!name) {
        Effects.showToast("Masukkan callsign dulu!", "error");
        return;
      }
      var avatar =
        ((document.querySelector(".avatar-item.selected") || {}).dataset &&
          document.querySelector(".avatar-item.selected").dataset.avatar) ||
        "⚡";
      var skin =
        ((document.querySelector(".skin-opt.selected") || {}).dataset &&
          document.querySelector(".skin-opt.selected").dataset.skin) ||
        "default";
      var p = getProfile();
      p.name = name;
      p.avatar = avatar;
      p.skin = skin;
      saveProfile(p);
      UI.updateMenuDisplay(p);
      Audio.wordComplete();
      UI.showScreen("screen-menu");
    });

    g("inputUsername").addEventListener("keydown", function (e) {
      if (e.key === "Enter") g("btnConfirmLogin").click();
    });

    g("btnSolo").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
      startSolo();
    });
    g("btnMultiplayer").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
      UI.showScreen("screen-multiplayer");
    });
    g("btnStats").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
      var p = getProfile();
      UI.buildStats(p.stats || {});
      UI.showScreen("screen-stats");
    });

    g("btnBackFromMP").addEventListener("click", function () {
      UI.showScreen("screen-menu");
    });
    g("btnBackFromStats").addEventListener("click", function () {
      UI.showScreen("screen-menu");
    });

    g("btnEditProfile").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
      var p = getProfile();
      UI.showScreen("screen-login");
      UI.buildAvatarGrid();
      UI.buildSkinOptions();
      var inp = g("inputUsername");
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

    g("btnLogout").addEventListener("click", function () {
      Audio.tryPlayPending();
      Audio.keyPress();
      if (confirm("Logout dan hapus profil kamu?")) {
        localStorage.removeItem(KEY);
        profile = null;
        UI.showScreen("screen-login");
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
        g("inputUsername").value = "";
      }
    });

    g("btnCreateRoom").addEventListener("click", function () {
      Audio.tryPlayPending();
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      g("btnCreateRoom").disabled = true;
      g("btnCreateRoom").textContent = "CREATING...";
      Multiplayer.createRoom({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      }).then(function (r) {
        g("btnCreateRoom").disabled = false;
        g("btnCreateRoom").textContent = "CREATE";
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
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_start", function (data) {
          startMpGame(data.word);
        });
        Multiplayer.on("players_update", function (data) {
          buildLobby(data.players, true, r.roomCode);
        });
      });
    });

    g("btnJoinRoom").addEventListener("click", function () {
      Audio.tryPlayPending();
      var code = (g("inputRoomCode").value || "").trim().toUpperCase();
      if (code.length < 4) {
        Effects.showToast("Kode minimal 4 karakter!", "error");
        return;
      }
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      g("btnJoinRoom").disabled = true;
      g("btnJoinRoom").textContent = "JOINING...";
      Multiplayer.joinRoom(code, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      }).then(function (r) {
        g("btnJoinRoom").disabled = false;
        g("btnJoinRoom").textContent = "JOIN";
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
          startMpGame(data.word);
        });
        Multiplayer.on("rematch_start", function (data) {
          startMpGame(data.word);
        });
        Multiplayer.on("players_update", function (data) {
          buildLobby(data.players, false, r.roomCode);
        });
      });
    });

    g("inputRoomCode").addEventListener("input", function () {
      this.value = this.value.toUpperCase();
    });

    g("btnCopyCode").addEventListener("click", function () {
      var code = g("lobbyCode").textContent;
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

    g("btnStartMatch").addEventListener("click", function () {
      Audio.tryPlayPending();
      Multiplayer.startGame().then(function () {
        startMpGame();
      });
    });

    g("btnLeaveLobby").addEventListener("click", function () {
      Multiplayer.leaveRoom().then(function () {
        _mpRoomCode = null;
        _mpIsHost = false;
        Audio.stopBgm(false);
        UI.showScreen("screen-menu");
      });
    });

    g("gameInput").addEventListener("input", function (e) {
      Game.handleInput(e);
    });

    var tz = document.querySelector(".typing-zone");
    if (tz)
      tz.addEventListener("click", function () {
        if (!isMobile()) {
          var inp = g("gameInput");
          if (inp) inp.focus();
        }
      });

    document.querySelectorAll(".skill-btn").forEach(function (btn) {
      function act(e) {
        e.preventDefault();
        var sk = btn.dataset.skill;
        if (sk) Game.activateSkill(sk);
      }
      btn.addEventListener("click", act);
      btn.addEventListener("touchend", act, { passive: false });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "1") Game.activateSkill("overdrive");
      if (e.key === "2") Game.activateSkill("freeze");
      if (e.key === "3") Game.activateSkill("burn");
    });

    document.addEventListener("keypress", function () {
      var active = document.querySelector(".screen.active");
      if (active && active.id === "screen-game" && !isMobile()) {
        var inp = g("gameInput");
        if (inp && document.activeElement !== inp) inp.focus();
      }
    });

    g("btnPlayAgain").addEventListener("click", function () {
      Audio.tryPlayPending();
      var st = Game.getState();
      if (st.mode === "multiplayer") {
        if (_mpIsHost && _mpRoomCode) {
          Effects.showToast("Memulai rematch...", "info");
          Multiplayer.startRematch().then(function () {
            startMpGame();
          });
        } else {
          Effects.showToast("Menunggu host untuk rematch...", "info");
          startMpGame();
        }
      } else {
        startSolo();
      }
    });

    g("btnBackToMenu").addEventListener("click", function () {
      Audio.stopBgm(true);
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

    function unlock() {
      try {
        if (window.AudioContext || window.webkitAudioContext) {
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          ctx.resume();
        }
      } catch (x) {}
      Audio.tryPlayPending();
    }
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("touchend", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  }

  return {
    init: init,
    getProfile: getProfile,
    saveProfile: saveProfile,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
