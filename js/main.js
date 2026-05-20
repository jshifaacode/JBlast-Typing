var App = (function () {
  var profile = null;
  var KEY = "keystorm_v2";
  var _mpRoomCode = null;
  var _mpIsHost = false;
  var _inMpSession = false;
  var _inMpGame = false;
  var _listenersBound = false;
  var _leavingGame = false;
  var _bgmStarted = false;
  var _voteBound = false;

  function getProfile() {
    if (!profile) {
      try {
        var s = localStorage.getItem(KEY);
        profile = s ? JSON.parse(s) : null;
      } catch (x) {}
      if (!profile)
        profile = {
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
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch (x) {}
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
      if (el) el.textContent += lines[i] + "\n";
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
        if (inp) inp.focus();
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
    var wp = document.querySelector(".word-panel");
    if (wp) {
      wp.style.opacity = "";
      wp.style.pointerEvents = "";
    }
    var p = getProfile();
    UI.showScreen("screen-game");
    _setupGameScreen();
    if (!GameAudio.isMuted() && !GameAudio.isPlaying()) {
      _bgmStarted = true;
      GameAudio.playBgm();
    }
    Game.init("multiplayer", p.skin, firstWord);
    Game.setupMultiplayer();
    setTimeout(function () {
      _inMpGame = false;
    }, 5000);
  }

  function _leaveMp() {
    if (_leavingGame) return;
    _leavingGame = true;
    _inMpSession = false;
    _inMpGame = false;
    _listenersBound = false;
    var wasBgmStarted = _bgmStarted;
    _bgmStarted = false;
    Multiplayer.leaveRoom().then(function () {
      _mpRoomCode = null;
      _mpIsHost = false;
      _leavingGame = false;
      if (wasBgmStarted) GameAudio.stopBgm(false);
      UI.updateMenuDisplay(getProfile());
      UI.showScreen("screen-menu");
    });
  }

  function _setupMpListeners() {
    if (_listenersBound) return;
    _listenersBound = true;

    Multiplayer.on("players_update", function (data) {
      if (!_inMpSession) return;
      var code = Multiplayer.getCurrentRoom();
      var host = Multiplayer.getIsHost();
      if (code) buildLobby(data.players, host, code);
    });

    Multiplayer.on("game_start", function (data) {
      if (_leavingGame || !_inMpSession) return;
      startMpGame(data.word);
    });

    Multiplayer.on("rematch_start", function (data) {
      if (_leavingGame || !_inMpSession) return;
      _inMpGame = false;
      startMpGame(data.word);
    });

    Multiplayer.on("rematch_votes_update", function (data) {
      if (!_inMpSession) return;
      var players = Multiplayer.getPlayers();
      var myId = Multiplayer.getPlayerId();
      UI.updateVoteDisplay(data.voteMap || {}, players, myId);
      var rsEl = document.getElementById("rematchStatus");
      if (rsEl) {
        if (data.hasDecline) {
          rsEl.style.display = "block";
          rsEl.textContent = "Ada yang decline — kembali ke menu...";
          rsEl.style.color = "var(--r)";
        } else if (data.votes >= data.total && data.total >= 2) {
          rsEl.style.display = "block";
          rsEl.textContent = "Semua setuju! Memulai rematch...";
          rsEl.style.color = "var(--g)";
        } else if (data.votes > 0) {
          rsEl.style.display = "block";
          rsEl.textContent =
            "Voting: " + data.votes + "/" + data.total + " pemain siap...";
          rsEl.style.color = "var(--c)";
        } else {
          rsEl.style.display = "none";
        }
      }
      if (data.hasDecline) {
        setTimeout(function () {
          if (_inMpSession && !_leavingGame) _leaveMp();
        }, 1800);
      }
    });
  }

  function buildLobby(players, isHostFlag, roomCode) {
    var lobbyCode = document.getElementById("lobbyCode");
    var lobbyStatus = document.getElementById("lobbyStatus");
    var grid = document.getElementById("lobbyPlayers");
    var btnStart = document.getElementById("btnStartMatch");

    if (lobbyCode) lobbyCode.textContent = roomCode;
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
            '<div class="lpc-status" style="color:var(--g)">READY</div></div>'
          );
        })
        .join("");
    }

    if (btnStart) {
      if (isHostFlag) {
        btnStart.style.display = "block";
        var canStart = players.length >= Multiplayer.getMinPlayers();
        btnStart.disabled = !canStart;
        btnStart.style.opacity = canStart ? "1" : "0.4";
        btnStart.style.pointerEvents = canStart ? "auto" : "none";
        if (!btnStart._startBound) {
          btnStart._startBound = true;
          btnStart.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            GameAudio.unlock();
            _doStartMatch();
          });
          btnStart.addEventListener(
            "touchend",
            function (e) {
              e.preventDefault();
              e.stopPropagation();
              GameAudio.unlock();
              _doStartMatch();
            },
            { passive: false },
          );
        }
      } else {
        btnStart.style.display = "none";
      }
    }
  }

  function _doStartMatch() {
    if (!Multiplayer.getIsHost()) return;
    if (Multiplayer.getPlayers().length < Multiplayer.getMinPlayers()) {
      Effects.showToast(
        "Butuh minimal " + Multiplayer.getMinPlayers() + " pemain!",
        "error",
      );
      return;
    }
    var btn = document.getElementById("btnStartMatch");
    if (btn && btn.disabled) return;
    GameAudio.keyPress();
    if (btn) {
      btn.disabled = true;
      btn.style.pointerEvents = "none";
      btn.textContent = "STARTING...";
    }
    Multiplayer.startGame();
  }

  function _handleVoteAccept() {
    var aBtn = document.getElementById("btnVoteAccept");
    var dBtn = document.getElementById("btnVoteDecline");
    if (!aBtn || aBtn.disabled) return;
    aBtn.disabled = true;
    if (dBtn) dBtn.disabled = true;
    Multiplayer.voteRematch(true);
    var st = document.getElementById("rematchVoteStatus");
    if (st) {
      st.textContent = "Kamu ACCEPT — menunggu lainnya...";
      st.style.color = "var(--g)";
    }
    GameAudio.keyPress();
  }

  function _handleVoteDecline() {
    var aBtn = document.getElementById("btnVoteAccept");
    var dBtn = document.getElementById("btnVoteDecline");
    if (!dBtn || dBtn.disabled) return;
    if (aBtn) aBtn.disabled = true;
    dBtn.disabled = true;
    Multiplayer.voteRematch(false);
    var st = document.getElementById("rematchVoteStatus");
    if (st) {
      st.textContent = "Kamu DECLINE — kembali ke menu...";
      st.style.color = "var(--r)";
    }
    GameAudio.keyError();
    setTimeout(function () {
      if (_inMpSession && !_leavingGame) _leaveMp();
    }, 1200);
  }

  function _bindVoteButtons() {
    if (_voteBound) return;
    _voteBound = true;
    function handleVote(target) {
      if (!_inMpSession) return;
      var acc = target.closest
        ? target.closest("#btnVoteAccept")
        : target.id === "btnVoteAccept"
          ? target
          : null;
      var dec = target.closest
        ? target.closest("#btnVoteDecline")
        : target.id === "btnVoteDecline"
          ? target
          : null;
      if (acc) _handleVoteAccept();
      else if (dec) _handleVoteDecline();
    }
    document.addEventListener("click", function (e) {
      handleVote(e.target);
    });
    document.addEventListener(
      "touchend",
      function (e) {
        if (!_inMpSession) return;
        var acc = e.target.closest
          ? e.target.closest("#btnVoteAccept")
          : e.target.id === "btnVoteAccept"
            ? e.target
            : null;
        var dec = e.target.closest
          ? e.target.closest("#btnVoteDecline")
          : e.target.id === "btnVoteDecline"
            ? e.target
            : null;
        if (acc) {
          e.preventDefault();
          _handleVoteAccept();
        } else if (dec) {
          e.preventDefault();
          _handleVoteDecline();
        }
      },
      { passive: false },
    );
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
      var nameEl = document.getElementById("inputUsername");
      var name = (nameEl ? nameEl.value : "").trim();
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

    var unEl = document.getElementById("inputUsername");
    if (unEl) {
      unEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var cb = document.getElementById("btnConfirmLogin");
          if (cb) cb.click();
        }
      });
    }

    addTap("btnSolo", function () {
      if (!GameAudio.isMuted() && !GameAudio.isPlaying()) {
        _bgmStarted = true;
        GameAudio.playBgm();
      }
      GameAudio.keyPress();
      startSolo();
    });

    addTap("btnMultiplayer", function () {
      GameAudio.keyPress();
      UI.showScreen("screen-multiplayer");
    });
    addTap("btnHowToPlay", function () {
      GameAudio.keyPress();
      _showHowToPlay();
    });
    addTap("btnCloseHowToPlay", function () {
      _hideHowToPlay();
    });

    var htpModal = document.getElementById("howToPlayModal");
    if (htpModal) {
      htpModal.addEventListener("click", function (e) {
        if (e.target === this) _hideHowToPlay();
      });
    }

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
        try {
          localStorage.removeItem(KEY);
        } catch (x) {}
        profile = null;
        UI.showScreen("screen-login");
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
        var inp = document.getElementById("inputUsername");
        if (inp) inp.value = "";
      }
    });

    addTap("btnToggleBgm", function () {
      var muted = !GameAudio.isMuted();
      GameAudio.setMuted(muted);
      var bgmBtn = document.getElementById("btnToggleBgm");
      if (bgmBtn)
        bgmBtn.innerHTML =
          '<i class="fa-solid fa-music"></i> BGM: ' + (muted ? "OFF" : "ON");
      if (!muted && !GameAudio.isPlaying()) {
        _bgmStarted = true;
        GameAudio.playBgm();
      }
      Effects.showToast("BGM " + (muted ? "OFF" : "ON"), "info", 1200);
    });

    addTap("btnCreateRoom", function () {
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      var btn = document.getElementById("btnCreateRoom");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "CREATING...";
      }
      _listenersBound = false;
      _setupMpListeners();
      Multiplayer.createRoom({ id: p.id, name: p.name, avatar: p.avatar }).then(
        function (r) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "CREATE ROOM";
          }
          if (!r) {
            Effects.showToast("Gagal buat room!", "error");
            return;
          }
          _mpRoomCode = r.roomCode;
          _mpIsHost = true;
          _inMpSession = true;
          buildLobby(r.players, true, r.roomCode);
          UI.showScreen("screen-lobby");
          Effects.showToast("Room dibuat! Share kode ke teman.", "success");
        },
      );
    });

    addTap("btnJoinRoom", function () {
      var codeEl = document.getElementById("inputRoomCode");
      var code = (codeEl ? codeEl.value : "").trim().toUpperCase();
      if (code.length < 4) {
        Effects.showToast("Kode minimal 4 karakter!", "error");
        return;
      }
      var p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      var btn = document.getElementById("btnJoinRoom");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "JOINING...";
      }
      _listenersBound = false;
      _setupMpListeners();
      Multiplayer.joinRoom(code, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
      }).then(function (r) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "JOIN ROOM";
        }
        if (!r) return;
        _mpRoomCode = r.roomCode;
        _mpIsHost = false;
        _inMpSession = true;
        buildLobby(r.players, false, r.roomCode);
        UI.showScreen("screen-lobby");
        Effects.showToast(
          "Joined " + r.roomCode + "! Tunggu host start.",
          "success",
        );
      });
    });

    var rcEl = document.getElementById("inputRoomCode");
    if (rcEl) {
      rcEl.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
      });
    }

    addTap("btnCopyCode", function () {
      var codeEl = document.getElementById("lobbyCode");
      var code = codeEl ? codeEl.textContent : "";
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).catch(function () {});
      } else {
        var ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch (x) {}
        ta.remove();
      }
      Effects.showToast("Kode disalin: " + code, "success");
    });

    addTap("btnLeaveLobby", function () {
      _inMpSession = false;
      _listenersBound = false;
      Multiplayer.leaveRoom().then(function () {
        _mpRoomCode = null;
        _mpIsHost = false;
        GameAudio.stopBgm(false);
        _bgmStarted = false;
        UI.showScreen("screen-menu");
      });
    });

    _bindVoteButtons();

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
      if (!active || active.id !== "screen-game" || isMobile()) return;
      var inp = document.getElementById("gameInput");
      if (inp && document.activeElement !== inp && !inp.disabled) inp.focus();
    });

    addTap("btnPlayAgain", function () {
      var st = Game.getState();
      if (st.multiplayer) return;
      if (!GameAudio.isMuted() && !GameAudio.isPlaying()) {
        _bgmStarted = true;
        GameAudio.playBgm();
      }
      startSolo();
    });

    addTap("btnBackToMenu", function () {
      var st = Game.getState();
      if (st.multiplayer && _inMpSession) {
        _leaveMp();
      } else {
        _leavingGame = false;
        GameAudio.stopBgm(true);
        _bgmStarted = false;
        UI.updateMenuDisplay(getProfile());
        UI.showScreen("screen-menu");
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) GameAudio.pauseBgm();
      else if (GameAudio.isPlaying()) GameAudio.resumeBgm();
    });
  }

  function _showHowToPlay() {
    var m = document.getElementById("howToPlayModal");
    if (m) {
      m.style.display = "flex";
      setTimeout(function () {
        m.classList.add("active");
      }, 10);
    }
  }

  function _hideHowToPlay() {
    var m = document.getElementById("howToPlayModal");
    if (m) {
      m.classList.remove("active");
      setTimeout(function () {
        m.style.display = "none";
      }, 300);
    }
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

  return { init, getProfile, saveProfile };
})();

document.addEventListener("DOMContentLoaded", App.init);
