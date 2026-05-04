const UI = (() => {
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.remove("active");
      s.style.display = "";
    });
    const t = document.getElementById(id);
    if (t) {
      t.style.display = "flex";
      setTimeout(() => t.classList.add("active"), 10);
    }
  }
  

  function buildAvatarGrid() {
    const avs = [
      "⚡",
      "💀",
      "🔥",
      "👾",
      "🤖",
      "🦾",
      "🧬",
      "💥",
      "🛸",
      "🔮",
      "🌀",
      "⚔️",
    ];
    const grid = document.getElementById("avatarGrid");
    if (!grid) return;
    grid.innerHTML = avs
      .map(
        (a, i) =>
          `<div class="avatar-item${i === 0 ? " selected" : ""}" data-avatar="${a}">${a}</div>`,
      )
      .join("");
    grid.querySelectorAll(".avatar-item").forEach((opt) => {
      const sel = () => {
        grid
          .querySelectorAll(".avatar-item")
          .forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        Audio.keyPress();
      };
      opt.addEventListener("click", sel);
      opt.addEventListener("touchend", (e) => {
        e.preventDefault();
        sel();
      });
    });
  }

  function buildSkinOptions() {
    const skins = [
      { id: "default", label: "◈ DEFAULT" },
      { id: "fire", label: "🔥 FIRE" },
      { id: "lightning", label: "⚡ LIGHTNING" },
      { id: "glitch", label: "💀 GLITCH" },
      { id: "ice", label: "❄️ ICE" },
    ];
    const el = document.getElementById("skinOptions");
    if (!el) return;
    el.innerHTML = skins
      .map(
        (s, i) =>
          `<div class="skin-option${i === 0 ? " selected" : ""}" data-skin="${s.id}">${s.label}</div>`,
      )
      .join("");
    el.querySelectorAll(".skin-option").forEach((opt) => {
      const sel = () => {
        el.querySelectorAll(".skin-option").forEach((o) =>
          o.classList.remove("selected"),
        );
        opt.classList.add("selected");
        Audio.keyPress();
      };
      opt.addEventListener("click", sel);
      opt.addEventListener("touchend", (e) => {
        e.preventDefault();
        sel();
      });
    });
  }

  function updateMenuDisplay(p) {
    const g = (n) => document.getElementById(n);
    if (g("menuUsername")) g("menuUsername").textContent = p.name || "PILOT";
    if (g("menuAvatar")) g("menuAvatar").textContent = p.avatar || "⚡";
    const xp = p.xp || 0,
      lvl = Math.floor(Math.sqrt(xp / 50)) + 1;
    if (g("menuLevel")) g("menuLevel").textContent = "LVL " + lvl;
    const curBase = (lvl - 1) ** 2 * 50,
      nextBase = lvl ** 2 * 50;
    const pct = Math.min(
      100,
      Math.round(((xp - curBase) / (nextBase - curBase)) * 100),
    );
    if (g("xpFill")) g("xpFill").style.width = pct + "%";
    if (g("xpText"))
      g("xpText").textContent =
        xp - curBase + " / " + (nextBase - curBase) + " XP";
    const stats = p.stats || {};
    if (g("statWpm")) g("statWpm").textContent = stats.bestWpm || 0;
    if (g("statAcc")) g("statAcc").textContent = (stats.avgAcc || 0) + "%";
    if (g("statWins")) g("statWins").textContent = stats.wins || 0;
  }

  function buildStats(stats) {
    const grid = document.getElementById("statsGrid");
    if (!grid) return;
    const items = [
      { v: stats.gamesPlayed || 0, l: "GAMES PLAYED" },
      { v: stats.bestWpm || 0, l: "BEST WPM" },
      { v: (stats.avgAcc || 0) + "%", l: "AVG ACC" },
      { v: stats.wins || 0, l: "WINS" },
      { v: stats.bestCombo || 0, l: "BEST COMBO" },
      { v: stats.totalScore || 0, l: "TOTAL SCORE" },
    ];
    grid.innerHTML = items
      .map(
        (i) =>
          `<div class="stat-card"><span class="sv bb">${i.v}</span><span class="sl">${i.l}</span></div>`,
      )
      .join("");
  }

  function showResult({
    victory,
    wpm,
    accuracy,
    maxCombo,
    score,
    mpWinner,
    mpPlayers,
  }) {
    let rank = "F";
    if (wpm >= 80 && accuracy >= 95) rank = "S";
    else if (wpm >= 55 && accuracy >= 88) rank = "A";
    else if (wpm >= 35 && accuracy >= 78) rank = "B";
    else if (wpm >= 20 && accuracy >= 65) rank = "C";
    else if (wpm >= 10 || accuracy >= 50) rank = "D";

    const xpEarned = wpm * 2 + maxCombo * 5 + (victory ? 100 : 20);
    const p = App.getProfile();
    p.xp = (p.xp || 0) + xpEarned;
    if (!p.stats) p.stats = {};
    p.stats.gamesPlayed = (p.stats.gamesPlayed || 0) + 1;
    if (victory) p.stats.wins = (p.stats.wins || 0) + 1;
    if (wpm >= (p.stats.bestWpm || 0)) p.stats.bestWpm = wpm;
    p.stats.avgAcc = Math.round(
      ((p.stats.avgAcc || 0) * (p.stats.gamesPlayed - 1) + accuracy) /
        p.stats.gamesPlayed,
    );
    if (maxCombo >= (p.stats.bestCombo || 0)) p.stats.bestCombo = maxCombo;
    p.stats.totalScore = (p.stats.totalScore || 0) + score;
    App.saveProfile(p);

    const g = (n) => document.getElementById(n);
    let titleText = victory ? "MISSION COMPLETE" : "MISSION FAILED";
    if (mpWinner) titleText = victory ? "🏆 KAU MENANG!" : "💀 KAU KALAH";
    if (g("resultTitle")) {
      g("resultTitle").textContent = titleText;
      g("resultTitle").className =
        "result-banner " + (victory ? "win" : "lose");
    }
    if (g("resultRank")) {
      g("resultRank").textContent = rank;
      g("resultRank").className = "result-rank rank-" + rank;
    }
    if (g("rWpm")) g("rWpm").textContent = wpm;
    if (g("rAcc")) g("rAcc").textContent = accuracy + "%";
    if (g("rCombo")) g("rCombo").textContent = maxCombo;
    if (g("rScore")) g("rScore").textContent = score;
    if (g("rXp")) g("rXp").textContent = "+" + xpEarned + " XP";

    const mpEl = g("mpResultInfo");
    if (mpEl) {
      if (mpWinner && mpPlayers && mpPlayers.length > 0) {
        const myId = Multiplayer.getPlayerId();
        const sorted = [...mpPlayers].sort((a, b) => (b.hp || 0) - (a.hp || 0));
        const medals = ["🥇", "🥈", "🥉"];
        const rankColors = [
          "win-rank-1",
          "win-rank-2",
          "win-rank-3",
          "win-rank-other",
        ];

        const rows = sorted
          .map((pl, idx) => {
            const isMe = pl.id === myId;
            const isWinner = pl.id === mpWinner;
            const hp = Math.max(0, Math.floor(pl.hp || 0));
            const hpClass =
              hp > 60 ? "high" : hp > 30 ? "mid" : hp > 0 ? "low" : "dead";
            const medal = medals[idx] || idx + 1 + ".";
            const rankCls = rankColors[Math.min(idx, 3)];
            const wpmInfo = pl.wpm ? `${pl.wpm} WPM` : "";
            return `<div class="win-ranking-row${isMe ? " win-rank-me" : ""}">
            <div class="win-rank-num ${rankCls}">${medal}</div>
            <div class="win-rank-info">
              <div class="win-rank-name">${pl.avatar || "⚡"} ${pl.name}${isMe ? " (YOU)" : ""}${isWinner ? " 👑" : ""}</div>
              <div class="win-rank-wpm">${wpmInfo}</div>
            </div>
            <div class="win-rank-hp ${hpClass}">${hp} HP</div>
          </div>`;
          })
          .join("");

        mpEl.innerHTML = `<div class="win-ranking-box"><div class="win-ranking-title bb">BATTLE RANKING</div>${rows}</div>`;
      } else {
        mpEl.innerHTML = "";
      }
    }

    showScreen("screen-result");
  }

  return {
    showScreen,
    buildAvatarGrid,
    buildSkinOptions,
    updateMenuDisplay,
    buildStats,
    showResult,
  };
})();

function buildMobileKeyboard() {
  const container = document.getElementById("mobileKeyboard");
  if (!container) return;
  container.style.display = "flex";
  const layout = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  container.innerHTML = layout
    .map(
      (row, ri) =>
        `<div class="kb-row">${ri === 2 ? '<button class="key-btn key-back bb" data-key="BACK">←</button>' : ""}${row
          .split("")
          .map(
            (c) => `<button class="key-btn bb" data-key="${c}">${c}</button>`,
          )
          .join(
            "",
          )}${ri === 2 ? '<button class="key-btn key-space bb" data-key=" ">SPC</button>' : ""}</div>`,
    )
    .join("");
  container.querySelectorAll(".key-btn").forEach((btn) => {
    const handle = (e) => {
      e.preventDefault();
      const key = btn.dataset.key;
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 120);
      Game.handleVirtualKey(key);
      Audio.keyPress();
    };
    btn.addEventListener("touchstart", handle, { passive: false });
    btn.addEventListener("mousedown", handle);
  });
}
