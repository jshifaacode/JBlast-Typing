var UI = (function() {
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function(s) {
      s.classList.remove("active");
      s.style.display = "";
    });
    var t = document.getElementById(id);
    if (t) {
      t.style.display = "flex";
      setTimeout(function() { t.classList.add("active"); }, 10);
    }
  }

  function _makeSel(container, cls) {
    container.querySelectorAll("." + cls).forEach(function(opt) {
      function sel() {
        container.querySelectorAll("." + cls).forEach(function(o) { o.classList.remove("selected"); });
        opt.classList.add("selected");
        Audio.keyPress();
      }
      opt.addEventListener("mousedown", function(e) { e.preventDefault(); sel(); });
      opt.addEventListener("touchstart", function(e) { e.preventDefault(); sel(); }, { passive:false });
    });
  }

  function buildAvatarGrid() {
    var avs = ["⚡","💀","🔥","👾","🤖","🦾","🧬","💥","🛸","🔮","🌀","⚔️"];
    var grid = document.getElementById("avatarGrid");
    if (!grid) return;
    grid.innerHTML = avs.map(function(a, i) {
      return '<div class="avatar-item' + (i===0?" selected":"") + '" data-avatar="' + a + '">' + a + "</div>";
    }).join("");
    _makeSel(grid, "avatar-item");
  }

  function buildSkinOptions() {
    var skins = [
      { id:"default", label:"◈ DEFAULT" },
      { id:"fire", label:"🔥 FIRE" },
      { id:"lightning", label:"⚡ LIGHTNING" },
      { id:"glitch", label:"💀 GLITCH" },
      { id:"ice", label:"❄️ ICE" },
    ];
    var el = document.getElementById("skinOptions");
    if (!el) return;
    el.innerHTML = skins.map(function(s, i) {
      return '<div class="skin-opt' + (i===0?" selected":"") + '" data-skin="' + s.id + '">' + s.label + "</div>";
    }).join("");
    _makeSel(el, "skin-opt");
  }

  function updateMenuDisplay(p) {
    function g(n) { return document.getElementById(n); }
    if (g("menuUsername")) g("menuUsername").textContent = p.name || "PILOT";
    if (g("menuAvatar")) g("menuAvatar").textContent = p.avatar || "⚡";
    var xp = p.xp || 0;
    var lvl = Math.floor(Math.sqrt(xp / 50)) + 1;
    if (g("menuLevel")) g("menuLevel").textContent = "LVL " + lvl;
    var curBase = Math.pow(lvl - 1, 2) * 50;
    var nextBase = Math.pow(lvl, 2) * 50;
    var range = nextBase - curBase;
    var pct = range > 0 ? Math.min(100, Math.round(((xp - curBase) / range) * 100)) : 100;
    if (g("xpFill")) g("xpFill").style.width = pct + "%";
    if (g("xpText")) g("xpText").textContent = (xp - curBase) + " / " + range + " XP";
    var stats = p.stats || {};
    if (g("statWpm")) g("statWpm").textContent = stats.bestWpm || 0;
    if (g("statAcc")) g("statAcc").textContent = (stats.avgAcc || 0) + "%";
    if (g("statWins")) g("statWins").textContent = stats.wins || 0;
    var bgmBtn = g("btnToggleBgm");
    if (bgmBtn) bgmBtn.textContent = "♪ BGM: " + (Audio.isMuted() ? "OFF" : "ON");
  }

  function buildStats(stats) {
    var grid = document.getElementById("statsGrid");
    if (!grid) return;
    var items = [
      { v:stats.gamesPlayed||0, l:"GAMES PLAYED" },
      { v:stats.bestWpm||0, l:"BEST WPM" },
      { v:(stats.avgAcc||0)+"%", l:"AVG ACC" },
      { v:stats.wins||0, l:"WINS" },
      { v:stats.bestCombo||0, l:"BEST COMBO" },
      { v:stats.totalScore||0, l:"TOTAL SCORE" },
    ];
    grid.innerHTML = items.map(function(i) {
      return '<div class="stat-card"><span class="sv bb">' + i.v + '</span><span class="sl">' + i.l + "</span></div>";
    }).join("");
  }

  function showResult(opts) {
    var victory = opts.victory;
    var wpm = opts.wpm;
    var accuracy = opts.accuracy;
    var maxCombo = opts.maxCombo;
    var score = opts.score;
    var mpWinner = opts.mpWinner;
    var mpPlayers = opts.mpPlayers;

    var rank = "F";
    if (accuracy >= 90 && wpm >= 45) rank = "S";
    else if (accuracy >= 82 && wpm >= 28) rank = "A";
    else if (accuracy >= 70 && wpm >= 15) rank = "B";
    else if (accuracy >= 55 && wpm >= 8) rank = "C";
    else if (accuracy >= 35 || wpm >= 4) rank = "D";
    if (victory && rank === "F") rank = "D";
    if (victory && rank === "D") rank = "C";

    var xpEarned = wpm * 3 + maxCombo * 5 + (victory ? 150 : 30);
    var p = App.getProfile();
    p.xp = (p.xp || 0) + xpEarned;
    if (!p.stats) p.stats = {};
    p.stats.gamesPlayed = (p.stats.gamesPlayed || 0) + 1;
    if (victory) p.stats.wins = (p.stats.wins || 0) + 1;
    if (wpm >= (p.stats.bestWpm || 0)) p.stats.bestWpm = wpm;
    p.stats.avgAcc = Math.round(((p.stats.avgAcc || 0) * (p.stats.gamesPlayed - 1) + accuracy) / p.stats.gamesPlayed);
    if (maxCombo >= (p.stats.bestCombo || 0)) p.stats.bestCombo = maxCombo;
    p.stats.totalScore = (p.stats.totalScore || 0) + score;
    App.saveProfile(p);

    function g(n) { return document.getElementById(n); }
    var titleText = victory ? "MISSION COMPLETE" : "MISSION FAILED";
    if (mpWinner) titleText = victory ? "🏆 KAU MENANG!" : "💀 KAU KALAH";
    if (g("resultTitle")) {
      g("resultTitle").textContent = titleText;
      g("resultTitle").className = "res-banner " + (victory ? "win" : "lose") + " bb";
    }
    if (g("resultRank")) {
      g("resultRank").textContent = rank;
      g("resultRank").className = "res-rank rank-" + rank + " bb";
    }
    if (g("rWpm")) g("rWpm").textContent = wpm;
    if (g("rAcc")) g("rAcc").textContent = accuracy + "%";
    if (g("rCombo")) g("rCombo").textContent = maxCombo;
    if (g("rScore")) g("rScore").textContent = score;
    if (g("rXp")) g("rXp").textContent = "+" + xpEarned + " XP";

    var mpEl = g("mpResultInfo");
    if (mpEl) {
      if (mpWinner && mpPlayers && mpPlayers.length > 0) {
        var myId = Multiplayer.getPlayerId();
        var sorted = mpPlayers.slice().sort(function(a, b) { return (b.hp||0) - (a.hp||0); });
        var medals = ["🥇","🥈","🥉"];
        var posCls = ["p1","p2","p3","px"];
        var rows = sorted.map(function(pl, idx) {
          var isMe = pl.id === myId;
          var isWinner = pl.id === mpWinner;
          var hp = Math.max(0, Math.floor(pl.hp || 0));
          var hpCls = hp > 100 ? "hi" : hp > 60 ? "md" : hp > 0 ? "lo" : "dd";
          var medal = medals[idx] || (idx + 1) + ".";
          var pCls = posCls[Math.min(idx, 3)];
          var wpmStr = pl.wpm ? pl.wpm + " WPM" : "";
          return '<div class="rank-row' + (isMe?" me":"") + '"><div class="rank-pos ' + pCls + '">' + medal + '</div><div class="rank-info"><div class="rank-name">' + (pl.avatar||"⚡") + " " + pl.name + (isMe?" (YOU)":"") + (isWinner?" 👑":"") + '</div><div class="rank-wpm">' + wpmStr + '</div></div><div class="rank-hp ' + hpCls + '">' + hp + " HP</div></div>";
        }).join("");
        mpEl.innerHTML = '<div class="rank-box"><div class="rank-box-ttl bb">BATTLE RANKING</div>' + rows + "</div>";
      } else {
        mpEl.innerHTML = "";
      }
    }
    showScreen("screen-result");
  }

  return { showScreen, buildAvatarGrid, buildSkinOptions, updateMenuDisplay, buildStats, showResult };
})();

function buildMobileKeyboard() {
  var container = document.getElementById("mobileKeyboard");
  if (!container) return;
  container.style.display = "flex";
  var layout = ["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];
  container.innerHTML = layout.map(function(row, ri) {
    var back = ri === 2 ? '<button class="key-btn key-back bb" data-key="BACK">←</button>' : "";
    var space = ri === 2 ? '<button class="key-btn key-space bb" data-key=" ">SPC</button>' : "";
    var keys = row.split("").map(function(c) {
      return '<button class="key-btn bb" data-key="' + c + '">' + c + "</button>";
    }).join("");
    return '<div class="kb-row">' + back + keys + space + "</div>";
  }).join("");

  container.querySelectorAll(".key-btn").forEach(function(btn) {
    function handle(e) {
      Audio.unlock();
      e.preventDefault();
      var key = btn.dataset.key;
      btn.classList.add("pressed");
      setTimeout(function() { btn.classList.remove("pressed"); }, 100);
      Game.handleVirtualKey(key);
      Audio.keyPress();
    }
    btn.addEventListener("touchstart", handle, { passive:false });
    btn.addEventListener("mousedown", handle);
  });
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640;
}
