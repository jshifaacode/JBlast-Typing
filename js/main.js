const App = (() => {
  let profile = null;
  const KEY = "keystorm_v2";

  function getProfile() {
    if (!profile) {
      const s = localStorage.getItem(KEY);
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
    const lines = [
      "> JBLASTTYPING OS v3.0 LOADING...",
      "> NEURAL TYPING ENGINE: ONLINE",
      "> COMBAT PROTOCOLS: ACTIVATED",
      "> MULTIPLAYER STACK: READY",
      "> AUDIO SUBSYSTEM: INITIALIZED",
      "> ENEMY WAVES INCOMING...",
      "> SELAMAT DATANG.",
    ];
    const el = document.getElementById("bootLines");
    const btn = document.getElementById("btnEnterGame");
    let i = 0;
    function add() {
      if (i >= lines.length) {
        setTimeout(() => {
          if (btn) btn.style.display = "block";
        }, 300);
        return;
      }
      el.textContent += lines[i] + "\n";
      i++;
      setTimeout(add, 270 + Math.random() * 160);
    }
    add();
  }

  function _setupGameScreen(isMob, inp, kb) {
    if (isMob) {
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
      setTimeout(() => inp && inp.focus(), 120);
    }
  }

  function startSolo() {
    const p = getProfile();
    UI.showScreen("screen-game");
    const kb = document.getElementById("mobileKeyboard");
    const inp = document.getElementById("gameInput");
    _setupGameScreen(isMobile(), inp, kb);
    document.getElementById("mpSidebar").style.display = "none";
    Audio.playBgm();
    Game.init("solo", p.skin);
  }

  function startMpGame(firstWord) {
    const st = Game.getState();
    if (
      document.getElementById("screen-game")?.classList.contains("active") &&
      st.running
    )
      return;
    const p = getProfile();
    UI.showScreen("screen-game");
    const kb = document.getElementById("mobileKeyboard");
    const inp = document.getElementById("gameInput");
    _setupGameScreen(isMobile(), inp, kb);
    Audio.playBgm();
    Game.init("multiplayer", p.skin, firstWord);
    Game.setupMultiplayer();
  }

  function stopGameBgm() {
    Audio.stopBgm(true);
  }

  function buildLobby(players, isHost, roomCode) {
    const g = (n) => document.getElementById(n);
    if (g("lobbyCode")) g("lobbyCode").textContent = roomCode;
    if (g("btnStartMatch"))
      g("btnStartMatch").style.display = isHost ? "block" : "none";
    if (g("lobbyStatus"))
      g("lobbyStatus").textContent = players.length + " PILOT(S) IN LOBBY";
    const grid = g("lobbyPlayers");
    if (grid)
      grid.innerHTML = players
        .map(
          (p) =>
            `<div class="lpc ready"><div class="lpc-avatar">${p.avatar || "⚡"}</div><div class="lpc-name bb">${p.name}</div><div class="lpc-status" style="color:var(--g)">READY</div></div>`,
        )
        .join("");
  }

  function bindEvents() {
    const g = (n) => document.getElementById(n);

    g("btnEnterGame").addEventListener("click", () => {
      Audio.keyPress();
      const p = getProfile();
      if (p.name) {
        UI.updateMenuDisplay(p);
        UI.showScreen("screen-menu");
      } else {
        UI.showScreen("screen-login");
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
      }
    });

    g("btnConfirmLogin").addEventListener("click", () => {
      const name = (g("inputUsername").value || "").trim();
      if (!name) {
        Effects.showToast("Masukkan callsign dulu!", "error");
        return;
      }
      const avatar =
        document.querySelector(".avatar-item.selected")?.dataset.avatar || "⚡";
      const skin =
        document.querySelector(".skin-option.selected")?.dataset.skin ||
        "default";
      const p = getProfile();
      p.name = name;
      p.avatar = avatar;
      p.skin = skin;
      saveProfile(p);
      UI.updateMenuDisplay(p);
      Audio.wordComplete();
      UI.showScreen("screen-menu");
    });

    g("inputUsername").addEventListener("keydown", (e) => {
      if (e.key === "Enter") g("btnConfirmLogin").click();
    });

    g("btnSolo").addEventListener("click", () => {
      Audio.keyPress();
      startSolo();
    });
    g("btnMultiplayer").addEventListener("click", () => {
      Audio.keyPress();
      UI.showScreen("screen-multiplayer");
    });
    g("btnStats").addEventListener("click", () => {
      Audio.keyPress();
      const p = getProfile();
      UI.buildStats(p.stats || {});
      UI.showScreen("screen-stats");
    });

    g("btnBackFromMP").addEventListener("click", () =>
      UI.showScreen("screen-menu"),
    );
    g("btnBackFromStats").addEventListener("click", () =>
      UI.showScreen("screen-menu"),
    );

    g("btnEditProfile").addEventListener("click", () => {
      Audio.keyPress();
      const p = getProfile();
      UI.showScreen("screen-login");
      UI.buildAvatarGrid();
      UI.buildSkinOptions();
      const inp = g("inputUsername");
      if (inp) inp.value = p.name || "";
      setTimeout(() => {
        const ca = document.querySelector(
          `.avatar-item[data-avatar="${p.avatar}"]`,
        );
        if (ca) {
          document
            .querySelectorAll(".avatar-item")
            .forEach((o) => o.classList.remove("selected"));
          ca.classList.add("selected");
        }
        const cs = document.querySelector(
          `.skin-option[data-skin="${p.skin}"]`,
        );
        if (cs) {
          document
            .querySelectorAll(".skin-option")
            .forEach((o) => o.classList.remove("selected"));
          cs.classList.add("selected");
        }
      }, 60);
    });

    g("btnLogout").addEventListener("click", () => {
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

    g("btnCreateRoom").addEventListener("click", async () => {
      const p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      g("btnCreateRoom").disabled = true;
      g("btnCreateRoom").textContent = "CREATING...";
      const r = await Multiplayer.createRoom({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      });
      g("btnCreateRoom").disabled = false;
      g("btnCreateRoom").textContent = "CREATE";
      if (!r) {
        Effects.showToast("Gagal buat room!", "error");
        return;
      }
      buildLobby(r.players, true, r.roomCode);
      UI.showScreen("screen-lobby");
      Effects.showToast("Room dibuat! Share kode ke teman.", "success");
      Multiplayer.on("game_start", ({ word }) => startMpGame(word));
      Multiplayer.on("players_update", ({ players }) =>
        buildLobby(players, true, r.roomCode),
      );
    });

    g("btnJoinRoom").addEventListener("click", async () => {
      const code = (g("inputRoomCode").value || "").trim().toUpperCase();
      if (code.length < 4) {
        Effects.showToast("Kode minimal 4 karakter!", "error");
        return;
      }
      const p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      g("btnJoinRoom").disabled = true;
      g("btnJoinRoom").textContent = "JOINING...";
      const r = await Multiplayer.joinRoom(code, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        hp: 200,
        wpm: 0,
        progress: 0,
      });
      g("btnJoinRoom").disabled = false;
      g("btnJoinRoom").textContent = "JOIN";
      if (!r) return;
      buildLobby(r.players, false, r.roomCode);
      UI.showScreen("screen-lobby");
      Effects.showToast(
        "Joined " + r.roomCode + "! Tunggu host start.",
        "success",
      );
      Multiplayer.on("game_start", ({ word }) => startMpGame(word));
      Multiplayer.on("players_update", ({ players }) =>
        buildLobby(players, false, r.roomCode),
      );
    });

    g("inputRoomCode").addEventListener("input", function () {
      this.value = this.value.toUpperCase();
    });

    g("btnCopyCode").addEventListener("click", () => {
      const code = g("lobbyCode").textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).catch(() => {});
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      Effects.showToast("Kode disalin: " + code, "success");
    });

    g("btnStartMatch").addEventListener("click", async () => {
      await Multiplayer.startGame();
      startMpGame();
    });

    g("btnLeaveLobby").addEventListener("click", async () => {
      await Multiplayer.leaveRoom();
      stopGameBgm();
      UI.showScreen("screen-menu");
    });

    g("gameInput").addEventListener("input", (e) => Game.handleInput(e));

    document.querySelector(".typing-zone")?.addEventListener("click", () => {
      if (!isMobile()) g("gameInput")?.focus();
    });

    document.querySelectorAll(".skill-btn").forEach((btn) => {
      const act = (e) => {
        e.preventDefault();
        const sk = btn.dataset.skill;
        if (sk) Game.activateSkill(sk);
      };
      btn.addEventListener("click", act);
      btn.addEventListener("touchend", act, { passive: false });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "1") Game.activateSkill("overdrive");
      if (e.key === "2") Game.activateSkill("freeze");
      if (e.key === "3") Game.activateSkill("burn");
    });

    document.addEventListener("keypress", () => {
      const active = document.querySelector(".screen.active")?.id;
      if (active === "screen-game" && !isMobile()) {
        const inp = g("gameInput");
        if (inp && document.activeElement !== inp) inp.focus();
      }
    });

    g("btnPlayAgain").addEventListener("click", () => {
      const st = Game.getState();
      if (st.mode === "multiplayer") startMpGame();
      else startSolo();
    });

    g("btnBackToMenu").addEventListener("click", () => {
      stopGameBgm();
      UI.updateMenuDisplay(getProfile());
      UI.showScreen("screen-menu");
    });
  }

  function initParticles() {
    const c = document.createElement("div");
    c.id = "particles";
    c.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2;pointer-events:none;overflow:hidden;";
    document.body.insertBefore(c, document.body.firstChild);
    for (let i = 0; i < 28; i++) {
      const p = document.createElement("div");
      const sz = Math.random() > 0.7 ? 3 : 2;
      p.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;background:${Math.random() > 0.5 ? "#00f5ff" : "#bf00ff"};opacity:${0.2 + Math.random() * 0.4};border-radius:0;animation:ptclUp ${9 + Math.random() * 16}s linear ${Math.random() * 10}s infinite;`;
      c.appendChild(p);
    }
    const style = document.createElement("style");
    style.textContent =
      "@keyframes ptclUp{0%{transform:translateY(110vh) rotate(0deg);opacity:0;}5%{opacity:.8;}95%{opacity:.6;}100%{transform:translateY(-10vh) rotate(720deg);opacity:0;}}";
    document.head.appendChild(style);
  }

  function init() {
    initParticles();
    bootSequence();
    bindEvents();
    UI.showScreen("screen-boot");
    const unlock = () => {
      try {
        new (window.AudioContext || window.webkitAudioContext)().resume();
      } catch (_) {}
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
  }

  return { init, getProfile, saveProfile, stopGameBgm };
})();

function isMobile() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.innerWidth < 640
  );
}

document.addEventListener("DOMContentLoaded", App.init);
