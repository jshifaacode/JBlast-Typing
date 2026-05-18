var UI = (function () {
  var AVATARS = [
    { id: "BOLT", icon: "fa-solid fa-bolt" },
    { id: "SKULL", icon: "fa-solid fa-skull" },
    { id: "FIRE", icon: "fa-solid fa-fire" },
    { id: "ALIEN", icon: "fa-solid fa-user-secret" },
    { id: "ROBOT", icon: "fa-solid fa-robot" },
    { id: "SHIELD", icon: "fa-solid fa-shield-halved" },
    { id: "DNA", icon: "fa-solid fa-dna" },
    { id: "BURST", icon: "fa-solid fa-burst" },
    { id: "SATELLITE", icon: "fa-solid fa-satellite" },
    { id: "GEM", icon: "fa-solid fa-gem" },
    { id: "TORNADO", icon: "fa-solid fa-tornado" },
    { id: "SWORD", icon: "fa-solid fa-khanda" },
  ];

  function _renderAvatar(av) {
    var found = AVATARS.find(function (a) {
      return a.id === av;
    });
    if (found) return '<i class="' + found.icon + '"></i>';
    return '<i class="fa-solid fa-user-astronaut"></i>';
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.remove("active");
      s.style.display = "";
    });
    var t = document.getElementById(id);
    if (t) {
      t.style.display = "flex";
      setTimeout(function () {
        t.classList.add("active");
      }, 10);
    }
    if (id === "screen-result") {
      var rsEl = document.getElementById("rematchStatus");
      if (rsEl) rsEl.style.display = "none";
      var btnPlay = document.getElementById("btnPlayAgain");
      if (btnPlay) {
        btnPlay.disabled = false;
        btnPlay.textContent = "MAIN LAGI";
      }
    }
  }

  function _makeSel(container, cls) {
    container.querySelectorAll("." + cls).forEach(function (opt) {
      function sel() {
        container.querySelectorAll("." + cls).forEach(function (o) {
          o.classList.remove("selected");
        });
        opt.classList.add("selected");
        GameAudio.keyPress();
      }
      opt.addEventListener("mousedown", function (e) {
        e.preventDefault();
        sel();
      });
      opt.addEventListener(
        "touchstart",
        function (e) {
          e.preventDefault();
          sel();
        },
        { passive: false },
      );
    });
  }

  function buildAvatarGrid() {
    var grid = document.getElementById("avatarGrid");
    if (!grid) return;
    grid.innerHTML = AVATARS.map(function (a, i) {
      return (
        '<div class="avatar-item' +
        (i === 0 ? " selected" : "") +
        '" data-avatar="' +
        a.id +
        '">' +
        '<i class="' +
        a.icon +
        '"></i>' +
        "</div>"
      );
    }).join("");
    _makeSel(grid, "avatar-item");
  }

  function buildSkinOptions() {
    var skins = [
      {
        id: "default",
        label: "DEFAULT",
        icon: "fa-solid fa-circle-half-stroke",
      },
      { id: "fire", label: "FIRE", icon: "fa-solid fa-fire" },
      { id: "lightning", label: "LIGHTNING", icon: "fa-solid fa-bolt" },
      { id: "glitch", label: "GLITCH", icon: "fa-solid fa-skull" },
      { id: "ice", label: "ICE", icon: "fa-solid fa-snowflake" },
    ];
    var el = document.getElementById("skinOptions");
    if (!el) return;
    el.innerHTML = skins
      .map(function (s, i) {
        return (
          '<div class="skin-opt' +
          (i === 0 ? " selected" : "") +
          '" data-skin="' +
          s.id +
          '">' +
          '<i class="' +
          s.icon +
          '"></i> ' +
          s.label +
          "</div>"
        );
      })
      .join("");
    _makeSel(el, "skin-opt");
  }

  function updateMenuDisplay(p) {
    function g(n) {
      return document.getElementById(n);
    }
    var avEl = g("menuAvatar");
    if (avEl) avEl.innerHTML = _renderAvatar(p.avatar);
    if (g("menuUsername")) g("menuUsername").textContent = p.name || "PILOT";
    var xp = p.xp || 0;
    var lvl = Math.floor(Math.sqrt(xp / 50)) + 1;
    if (g("menuLevel")) g("menuLevel").textContent = "LVL " + lvl;
    var curBase = Math.pow(lvl - 1, 2) * 50;
    var nextBase = Math.pow(lvl, 2) * 50;
    var range = nextBase - curBase;
    var pct =
      range > 0
        ? Math.min(100, Math.round(((xp - curBase) / range) * 100))
        : 100;
    if (g("xpFill")) g("xpFill").style.width = pct + "%";
    if (g("xpText"))
      g("xpText").textContent = xp - curBase + " / " + range + " XP";
    var stats = p.stats || {};
    if (g("statWpm")) g("statWpm").textContent = stats.bestWpm || 0;
    if (g("statAcc")) g("statAcc").textContent = (stats.avgAcc || 0) + "%";
    if (g("statWins")) g("statWins").textContent = stats.wins || 0;
    if (g("statMpWins")) g("statMpWins").textContent = stats.mpWins || 0;
    var bgmBtn = g("btnToggleBgm");
    if (bgmBtn)
      bgmBtn.innerHTML =
        '<i class="fa-solid fa-music"></i> BGM: ' +
        (GameAudio.isMuted() ? "OFF" : "ON");
  }

  function buildStats(stats) {
    var grid = document.getElementById("statsGrid");
    if (!grid) return;
    var items = [
      { v: stats.gamesPlayed || 0, l: "GAMES PLAYED" },
      { v: stats.bestWpm || 0, l: "BEST WPM" },
      { v: (stats.avgAcc || 0) + "%", l: "AVG ACC" },
      { v: stats.wins || 0, l: "SOLO WINS" },
      { v: stats.mpWins || 0, l: "MP WINS" },
      { v: stats.bestCombo || 0, l: "BEST COMBO" },
      { v: stats.totalScore || 0, l: "TOTAL SCORE" },
    ];
    grid.innerHTML = items
      .map(function (i) {
        return (
          '<div class="stat-card"><span class="sv bb">' +
          i.v +
          '</span><span class="sl">' +
          i.l +
          "</span></div>"
        );
      })
      .join("");
  }

  function showResult(opts) {
    var victory = opts.victory;
    var wpm = opts.wpm;
    var accuracy = opts.accuracy;
    var maxCombo = opts.maxCombo;
    var score = opts.score;
    var mpWinner = opts.mpWinner || null;
    var mpPlayers = opts.mpPlayers || null;
    var isMultiplayer = !!(mpWinner || (mpPlayers && mpPlayers.length > 0));

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
    if (victory) {
      if (isMultiplayer) p.stats.mpWins = (p.stats.mpWins || 0) + 1;
      else p.stats.wins = (p.stats.wins || 0) + 1;
    }
    if (wpm >= (p.stats.bestWpm || 0)) p.stats.bestWpm = wpm;
    p.stats.avgAcc = Math.round(
      ((p.stats.avgAcc || 0) * (p.stats.gamesPlayed - 1) + accuracy) /
        p.stats.gamesPlayed,
    );
    if (maxCombo >= (p.stats.bestCombo || 0)) p.stats.bestCombo = maxCombo;
    p.stats.totalScore = (p.stats.totalScore || 0) + score;
    App.saveProfile(p);

    function g(n) {
      return document.getElementById(n);
    }

    var titleText = isMultiplayer
      ? victory
        ? "VICTORY — KAU MENANG!"
        : "DEFEAT — KAU KALAH"
      : victory
        ? "MISSION COMPLETE"
        : "MISSION FAILED";

    if (g("resultTitle")) {
      g("resultTitle").textContent = titleText;
      g("resultTitle").className =
        "res-banner " + (victory ? "win" : "lose") + " bb";
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
      if (isMultiplayer && mpPlayers && mpPlayers.length > 0) {
        var myId = Multiplayer.getPlayerId();
        var sorted = mpPlayers.slice().sort(function (a, b) {
          return (b.hp || 0) - (a.hp || 0);
        });
        var medals = ["#1", "#2", "#3", "#4"];
        var posCls = ["p1", "p2", "p3", "px"];
        var rows = sorted
          .map(function (pl, idx) {
            var isMe = pl.id === myId;
            var isWinner = pl.id === mpWinner;
            var hp = Math.max(0, Math.floor(pl.hp || 0));
            var hpCls = hp > 100 ? "hi" : hp > 60 ? "md" : hp > 0 ? "lo" : "dd";
            var medal = medals[idx] || "#" + (idx + 1);
            var pCls = posCls[Math.min(idx, 3)];
            var wpmStr = pl.wpm ? pl.wpm + " WPM" : "";
            return (
              '<div class="rank-row' +
              (isMe ? " me" : "") +
              '">' +
              '<div class="rank-pos ' +
              pCls +
              '">' +
              medal +
              "</div>" +
              '<div class="rank-info">' +
              '<div class="rank-name">' +
              _renderAvatar(pl.avatar) +
              " " +
              pl.name +
              (isMe ? " (YOU)" : "") +
              (isWinner
                ? ' <i class="fa-solid fa-crown" style="color:var(--y)"></i>'
                : "") +
              "</div>" +
              '<div class="rank-wpm">' +
              wpmStr +
              "</div>" +
              "</div>" +
              '<div class="rank-hp ' +
              hpCls +
              '">' +
              hp +
              " HP</div>" +
              "</div>"
            );
          })
          .join("");

        mpEl.innerHTML =
          '<div class="rank-box"><div class="rank-box-ttl bb">BATTLE RANKING</div>' +
          rows +
          "</div>" +
          '<div class="rematch-vote-box" id="rematchVoteBox">' +
          '<div class="rematch-vote-lbl bb">MAIN LAGI?</div>' +
          '<div class="rematch-vote-btns" id="rematchVoteBtns">' +
          '<button class="btn bb" id="btnVoteAccept" style="min-width:130px;padding:16px 24px;font-size:16px;touch-action:manipulation;cursor:pointer;"><i class="fa-solid fa-check"></i> ACCEPT</button>' +
          '<button class="btn btn-red bb" id="btnVoteDecline" style="min-width:130px;padding:16px 24px;font-size:16px;touch-action:manipulation;cursor:pointer;"><i class="fa-solid fa-xmark"></i> DECLINE</button>' +
          "</div>" +
          '<div class="rematch-vote-status bb" id="rematchVoteStatus">Pilih Accept atau Decline</div>' +
          "</div>";
      } else {
        mpEl.innerHTML = "";
      }
    }

    var btnPlayAgain = g("btnPlayAgain");
    var btnBackToMenu = g("btnBackToMenu");
    if (isMultiplayer) {
      if (btnPlayAgain) btnPlayAgain.style.display = "none";
      if (btnBackToMenu) btnBackToMenu.textContent = "KELUAR ROOM";
    } else {
      if (btnPlayAgain) btnPlayAgain.style.display = "";
      if (btnBackToMenu) btnBackToMenu.textContent = "MAIN MENU";
    }

    showScreen("screen-result");
  }

  function updateVoteDisplay(votes, players, myId) {
    var statusEl = document.getElementById("rematchVoteStatus");
    if (!statusEl) return;
    var total = players.length;
    var acceptCount = players.filter(function (p) {
      return votes[p.id] === true;
    }).length;
    var declineCount = players.filter(function (p) {
      return votes[p.id] === false;
    }).length;
    var myVote = votes[myId];
    var acceptBtn = document.getElementById("btnVoteAccept");
    var declineBtn = document.getElementById("btnVoteDecline");
    if (myVote !== undefined) {
      if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = myVote === true ? "1" : "0.4";
      }
      if (declineBtn) {
        declineBtn.disabled = true;
        declineBtn.style.opacity = myVote === false ? "1" : "0.4";
      }
    }
    if (declineCount > 0) {
      statusEl.textContent = declineCount + " pemain menolak rematch.";
      statusEl.style.color = "var(--r)";
    } else if (acceptCount >= total) {
      statusEl.textContent = "Semua setuju! Memulai rematch...";
      statusEl.style.color = "var(--g)";
    } else {
      statusEl.textContent = "ACCEPT: " + acceptCount + "/" + total + " pemain";
      statusEl.style.color = "var(--c)";
    }
  }

  return {
    showScreen,
    buildAvatarGrid,
    buildSkinOptions,
    updateMenuDisplay,
    buildStats,
    showResult,
    updateVoteDisplay,
  };
})();

function buildMobileKeyboard() {
  var container = document.getElementById("mobileKeyboard");
  if (!container) return;
  container.style.display = "flex";
  var layout = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  container.innerHTML = layout
    .map(function (row, ri) {
      var back =
        ri === 2
          ? '<button class="key-btn key-back bb" data-key="BACK" style="touch-action:manipulation;min-width:44px;min-height:48px;font-size:18px;">&#8592;</button>'
          : "";
      var space =
        ri === 2
          ? '<button class="key-btn key-space bb" data-key=" " style="touch-action:manipulation;min-width:60px;min-height:48px;font-size:14px;">SPC</button>'
          : "";
      var keys = row
        .split("")
        .map(function (c) {
          return (
            '<button class="key-btn bb" data-key="' +
            c +
            '" style="touch-action:manipulation;min-height:48px;font-size:18px;">' +
            c +
            "</button>"
          );
        })
        .join("");
      return '<div class="kb-row">' + back + keys + space + "</div>";
    })
    .join("");

  container.querySelectorAll(".key-btn").forEach(function (btn) {
    function handle(e) {
      GameAudio.unlock();
      e.preventDefault();
      var key = btn.dataset.key;
      btn.classList.add("pressed");
      setTimeout(function () {
        btn.classList.remove("pressed");
      }, 100);
      Game.handleVirtualKey(key);
      GameAudio.keyPress();
    }
    btn.addEventListener("touchstart", handle, { passive: false });
    btn.addEventListener("mousedown", handle);
  });
}

function isMobile() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.innerWidth < 640
  );
}
