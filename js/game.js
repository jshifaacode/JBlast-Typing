var Game = (function () {
  var state = {
    mode: "solo",
    wave: 1,
    score: 0,
    playerHp: 200,
    maxPlayerHp: 200,
    combo: 0,
    maxCombo: 0,
    totalChars: 0,
    correctChars: 0,
    wrongChars: 0,
    startTime: null,
    currentWord: "",
    displayWord: "",
    typedIndex: 0,
    enemies: [],
    running: false,
    paused: false,
    gameTimer: 0,
    timerInterval: null,
    winCheckInterval: null,
    skills: {
      overdrive: { active: false, cooldown: 0 },
      freeze: { active: false, cooldown: 0 },
      burn: { active: false, cooldown: 0 },
    },
    multiplayer: false,
    skin: "default",
    _firstWord: null,
    _bots: [],
    _botCompleted: false,
    wordCount: 0,
    mpTimeLimit: 0,
    _eliminated: false,
    _spectateInterval: null,
    _endingMp: false,
  };

  var PLAYER_MAX_HP = 200;
  var MP_DURATION = 300;

  var ENEMIES = [
    {
      id: "bot",
      name: "ROGUE BOT",
      avatarHtml: '<i class="fa-solid fa-robot"></i>',
      maxHp: 80,
      attackDmg: 5,
      attackDelay: 12000,
    },
    {
      id: "virus",
      name: "VIRUS.EXE",
      avatarHtml: '<i class="fa-solid fa-bug"></i>',
      maxHp: 100,
      attackDmg: 7,
      attackDelay: 11000,
    },
    {
      id: "boss",
      name: "SYSTEM BOSS",
      avatarHtml: '<i class="fa-solid fa-skull-crossbones"></i>',
      maxHp: 180,
      attackDmg: 10,
      attackDelay: 9000,
      isBoss: true,
    },
    {
      id: "glitch",
      name: "GLITCH_GHOST",
      avatarHtml: '<i class="fa-solid fa-ghost"></i>',
      maxHp: 90,
      attackDmg: 6,
      attackDelay: 11000,
    },
    {
      id: "phantom",
      name: "PHANTOM.SYS",
      avatarHtml: '<i class="fa-solid fa-spider"></i>',
      maxHp: 120,
      attackDmg: 8,
      attackDelay: 10000,
    },
  ];

  function init(mode, skin, firstWord) {
    state.mode = mode;
    state.skin = skin || "default";
    state.wave = 1;
    state.score = 0;
    state.playerHp = PLAYER_MAX_HP;
    state.maxPlayerHp = PLAYER_MAX_HP;
    state.combo = 0;
    state.maxCombo = 0;
    state.totalChars = 0;
    state.correctChars = 0;
    state.wrongChars = 0;
    state.startTime = Date.now();
    state.running = false;
    state.gameTimer = 0;
    state.enemies = [];
    state._firstWord = firstWord || null;
    state._bots = [];
    state._botCompleted = false;
    state.wordCount = 0;
    state.multiplayer = false;
    state.mpTimeLimit = 0;
    state._eliminated = false;
    state._endingMp = false;
    clearInterval(state.timerInterval);
    clearInterval(state.winCheckInterval);
    clearInterval(state._spectateInterval);
    state._spectateInterval = null;

    ["Overdrive", "Freeze", "Burn"].forEach(function (sk) {
      var btn = document.getElementById("skill" + sk);
      if (btn) {
        btn.disabled = true;
        btn.classList.remove("ready-glow");
      }
      var cd = document.getElementById("cd" + sk);
      if (cd) cd.style.transform = "scaleX(0)";
    });

    var input = document.getElementById("gameInput");
    if (input) input.value = "";

    var indEl = document.getElementById("typingIndicators");
    if (indEl) indEl.innerHTML = "";

    showCountdown(function () {
      state.running = true;
      spawnWave();
      startTimers();
      renderHpBars();
    });
  }

  function showCountdown(cb) {
    var zone = document.getElementById("enemyZone");
    if (!zone) {
      cb();
      return;
    }
    zone.innerHTML = '<div class="countdown-overlay" id="cdOverlay"></div>';
    var overlay = document.getElementById("cdOverlay");
    var nums = ["3", "2", "1", "GO!"];
    var i = 0;
    function tick() {
      if (!overlay || !overlay.parentElement) {
        cb();
        return;
      }
      if (i >= nums.length) {
        overlay.parentElement.innerHTML = "";
        cb();
        return;
      }
      overlay.innerHTML =
        '<div class="countdown-num bb" style="color:' +
        (i === 3 ? "var(--g)" : "var(--c)") +
        ';">' +
        nums[i] +
        "</div>";
      i++;
      setTimeout(tick, i <= 3 ? 850 : 400);
    }
    tick();
  }

  function spawnWave() {
    var zone = document.getElementById("enemyZone");
    if (zone) zone.innerHTML = "";
    state.enemies = [];
    var waveMap = {
      1: [ENEMIES[0]],
      2: [ENEMIES[0]],
      3: [ENEMIES[1]],
      4: [ENEMIES[3]],
      5: [ENEMIES[4]],
      6: [ENEMIES[2]],
    };
    var config = waveMap[Math.min(state.wave, 6)] || [ENEMIES[1]];
    config.forEach(function (tmpl) {
      var scale = 1 + (state.wave - 1) * 0.06;
      var e = {
        id: tmpl.id,
        name: tmpl.name,
        avatarHtml: tmpl.avatarHtml,
        isBoss: tmpl.isBoss || false,
        maxHp: Math.floor(tmpl.maxHp * scale),
        hp: Math.floor(tmpl.maxHp * scale),
        attackDmg: tmpl.attackDmg,
        attackDelay: tmpl.attackDelay,
        phase: 1,
        frozen: false,
        burning: false,
        burnTick: null,
        attackTimer: null,
      };
      state.enemies.push(e);
      renderEnemy(e);
      scheduleAttack(e);
    });
    var wd = document.getElementById("waveDisplay");
    if (wd) wd.textContent = "W" + state.wave;
    if (state.mode === "solo") spawnBotOpponents();
    nextWord();
  }

  function spawnBotOpponents() {
    state._bots.forEach(clearInterval);
    state._bots = [];
    state._botCompleted = false;
    var botNames = [
      { n: "CYPHER_X", avatarHtml: '<i class="fa-solid fa-robot"></i>' },
      { n: "VOID_RUNNER", avatarHtml: '<i class="fa-solid fa-ghost"></i>' },
      { n: "GHOST_42", avatarHtml: '<i class="fa-solid fa-skull"></i>' },
    ];
    var count = Math.min(state.wave, 2);
    var bots = botNames.slice(0, count).map(function (b, i) {
      return {
        id: "bot_" + i,
        name: b.n,
        avatarHtml: b.avatarHtml,
        speed: 0.38 + state.wave * 0.12 + Math.random() * 0.25,
      };
    });
    var word = state.currentWord || "";
    var totalChars = word.replace(/ /g, "").length || 1;
    bots.forEach(function (bot) {
      var typed = 0;
      var delay = Math.floor(1000 / (bot.speed * 4));
      var iv = setInterval(
        function () {
          if (!state.running) {
            clearInterval(iv);
            return;
          }
          if (typed >= totalChars) {
            clearInterval(iv);
            if (!state._botCompleted) {
              state._botCompleted = true;
              onBotWordComplete(bot);
            }
            return;
          }
          typed++;
        },
        delay + Math.random() * 240,
      );
      state._bots.push(iv);
    });
  }

  function onBotWordComplete(bot) {
    if (!state.running) return;
    var dmg = 15 + state.wave * 2;
    state.playerHp = Math.max(0, state.playerHp - dmg);
    renderHpBars();
    Effects.damageFlash();
    GameAudio.playerHit();
    Effects.showToast(
      bot.name + " selesai duluan! -" + dmg + " HP",
      "error",
      2000,
    );
    if (state.playerHp <= 0) endGame(false);
  }

  function renderEnemy(e) {
    var zone = document.getElementById("enemyZone");
    if (!zone) return;
    var card = document.createElement("div");
    card.className = "enemy-card" + (e.isBoss ? " enemy-boss" : "");
    card.id = "enemy-" + e.id;
    card.innerHTML =
      '<div class="enemy-avatar">' +
      e.avatarHtml +
      "</div>" +
      '<div class="enemy-name bb">' +
      e.name +
      "</div>" +
      '<div class="enemy-phase" id="phase-' +
      e.id +
      '">PHASE ' +
      e.phase +
      "</div>" +
      '<div class="enemy-hp-track"><div class="enemy-hp-fill" id="hp-' +
      e.id +
      '" style="width:100%"></div></div>';
    zone.appendChild(card);
  }

  function scheduleAttack(e) {
    if (!state.running) return;
    var delay = e.frozen ? e.attackDelay * 2.5 : e.attackDelay;
    delay = delay * (0.75 + Math.random() * 0.5);
    e.attackTimer = setTimeout(function () {
      if (!state.running || e.hp <= 0) return;
      doAttack(e);
      scheduleAttack(e);
    }, delay);
  }

  function doAttack(e) {
    if (!state.running) return;
    var dmg = state.skills.overdrive.active
      ? Math.floor(e.attackDmg * 0.5)
      : e.attackDmg;
    state.playerHp = Math.max(0, state.playerHp - dmg);
    Effects.damageFlash();
    GameAudio.playerHit();
    renderHpBars();
    var card = document.getElementById("enemy-" + e.id);
    if (card) {
      var f = document.createElement("div");
      f.className = "enemy-attack-flash";
      card.appendChild(f);
      setTimeout(function () {
        if (f.parentElement) f.remove();
      }, 200);
    }
    if (state.multiplayer)
      Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);
    if (state.playerHp <= 0) {
      if (state.multiplayer) _handleMpDeath();
      else endGame(false);
    }
  }

  function _getAliveCount() {
    var allPlayers = Multiplayer.getPlayers();
    return allPlayers.filter(function (p) {
      return (p.hp || 0) > 0;
    }).length;
  }

  function _handleMpDeath() {
    if (state._eliminated) return;
    state._eliminated = true;
    state.running = false;
    clearInterval(state.timerInterval);
    clearInterval(state.winCheckInterval);
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    state._bots.forEach(clearInterval);
    Multiplayer.stopBots();

    var inp = document.getElementById("gameInput");
    if (inp) {
      inp.disabled = true;
      inp.value = "";
    }
    document.querySelectorAll(".key-btn").forEach(function (b) {
      b.disabled = true;
    });
    document.querySelectorAll(".skill-btn").forEach(function (b) {
      b.disabled = true;
    });
    var wordPanel = document.querySelector(".word-panel");
    if (wordPanel) {
      wordPanel.style.opacity = "0.3";
      wordPanel.style.pointerEvents = "none";
    }

    var myId = Multiplayer.getPlayerId();
    Multiplayer.updatePlayerHp(myId, 0).then(function () {
      _checkAndBroadcastWin();
    });
  }

  function _checkAndBroadcastWin() {
    if (!state.multiplayer || state._endingMp) return;
    var allPlayers = Multiplayer.getPlayers();
    if (allPlayers.length < 2) return;
    var alivePlayers = allPlayers.filter(function (p) {
      return (p.hp || 0) > 0;
    });
    if (alivePlayers.length > 1) return;
    var winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
    Multiplayer.broadcastGameOver(winnerId);
  }

  function endMpByTime() {
    if (state._endingMp) return;
    var myId = Multiplayer.getPlayerId();
    if (Multiplayer.getIsHost()) {
      var allPlayers = Multiplayer.getPlayers();
      var myPlayer = allPlayers.find(function (p) {
        return p.id === myId;
      });
      if (myPlayer) myPlayer.hp = state.playerHp;
      var sorted = allPlayers.slice().sort(function (a, b) {
        return (b.hp || 0) - (a.hp || 0);
      });
      var winner = sorted[0];
      Effects.showToast("WAKTU HABIS!", "warning");
      state.running = false;
      clearInterval(state.timerInterval);
      clearInterval(state.winCheckInterval);
      Multiplayer.broadcastGameOver(winner ? winner.id : null);
    } else {
      Effects.showToast("WAKTU HABIS!", "warning");
      state.running = false;
      clearInterval(state.timerInterval);
      clearInterval(state.winCheckInterval);
    }
  }

  function calcWpm() {
    var elapsed = (Date.now() - state.startTime) / 60000;
    return elapsed < 0.01 ? 0 : Math.floor(state.correctChars / 5 / elapsed);
  }

  function calcAcc() {
    return state.totalChars === 0
      ? 100
      : Math.floor((state.correctChars / state.totalChars) * 100);
  }

  function updateStats() {
    var w = calcWpm(),
      a = calcAcc();
    var we = document.getElementById("liveWpm"),
      ae = document.getElementById("liveAcc");
    if (we) we.textContent = w + " WPM";
    if (ae) ae.textContent = a + "%";
  }

  function updateCombo() {
    var tx = document.getElementById("comboText");
    if (!tx) return;
    if (state.combo >= 2) {
      tx.style.display = "block";
      tx.textContent = "COMBO x" + state.combo;
      tx.style.animation = "none";
      void tx.offsetHeight;
      tx.style.animation = "comboPulse .3s ease-out";
    } else {
      tx.style.display = "none";
    }
  }

  function renderHpBars() {
    var c = document.getElementById("hpBars");
    if (!c) return;
    var pPct = Math.max(0, (state.playerHp / state.maxPlayerHp) * 100);
    var pStyle =
      pPct <= 30
        ? "background:var(--r)"
        : pPct <= 60
          ? "background:var(--o)"
          : "";
    var html =
      '<div class="hpbar"><div class="hpbar-row"><span class="hpbar-name">YOU</span><span class="hpbar-val">' +
      Math.ceil(state.playerHp) +
      "/" +
      state.maxPlayerHp +
      '</span></div><div class="hpbar-track"><div class="hpbar-fill p" style="width:' +
      pPct +
      "%; " +
      pStyle +
      '"></div></div></div>';
    if (state.multiplayer) {
      var myId = Multiplayer.getPlayerId();
      Multiplayer.getPlayers()
        .filter(function (p) {
          return p.id !== myId;
        })
        .forEach(function (p) {
          var oppHp = typeof p.hp === "number" ? p.hp : PLAYER_MAX_HP;
          var oppPct = Math.max(
            0,
            Math.min(100, (oppHp / PLAYER_MAX_HP) * 100),
          );
          var deadStyle = oppHp <= 0 ? "opacity:0.4;" : "";
          html +=
            '<div class="hpbar" style="' +
            deadStyle +
            '"><div class="hpbar-row"><span class="hpbar-name">' +
            p.name +
            (oppHp <= 0 ? " 💀" : "") +
            '</span><span class="hpbar-val">' +
            Math.ceil(Math.max(0, oppHp)) +
            "/" +
            PLAYER_MAX_HP +
            '</span></div><div class="hpbar-track"><div class="hpbar-fill o" style="width:' +
            oppPct +
            '%"></div></div></div>';
        });
    } else {
      state.enemies.forEach(function (e) {
        var pct = Math.max(0, (e.hp / e.maxHp) * 100);
        html +=
          '<div class="hpbar"><div class="hpbar-row"><span class="hpbar-name">' +
          e.name +
          '</span><span class="hpbar-val">' +
          Math.ceil(e.hp) +
          "/" +
          e.maxHp +
          '</span></div><div class="hpbar-track"><div class="hpbar-fill e" style="width:' +
          pct +
          '%"></div></div></div>';
      });
    }
    c.innerHTML = html;
  }

  function updateMobileHL() {
    var next = state.currentWord[state.typedIndex];
    if (!next) return;
    document.querySelectorAll(".key-btn").forEach(function (b) {
      b.classList.remove("highlight");
      if (b.dataset.key === next.toUpperCase() || b.dataset.key === next)
        b.classList.add("highlight");
    });
  }

  function setupMultiplayer() {
    state.multiplayer = true;
    state.mpTimeLimit = MP_DURATION;
    state._eliminated = false;
    state._endingMp = false;
    state._spectateInterval && clearInterval(state._spectateInterval);
    state._spectateInterval = null;

    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "block";

    clearInterval(state.winCheckInterval);
    state.winCheckInterval = setInterval(function () {
      if (!state._endingMp) _checkAndBroadcastWin();
    }, 1500);

    Multiplayer.on("game_over_broadcast", function (data) {
      if (state._endingMp) return;
      state._endingMp = true;
      clearInterval(state.winCheckInterval);
      clearInterval(state._spectateInterval);
      state._spectateInterval = null;
      state.running = false;
      clearInterval(state.timerInterval);
      state.enemies.forEach(function (e) {
        clearTimeout(e.attackTimer);
        if (e.burnTick) clearInterval(e.burnTick);
      });
      state._bots.forEach(clearInterval);
      Multiplayer.stopBots();

      var myId = Multiplayer.getPlayerId();
      var iWon = data.winnerId === myId;
      var allPlayers =
        data.players && data.players.length
          ? data.players
          : Multiplayer.getPlayers();
      var myPlayer = allPlayers.find(function (p) {
        return p.id === myId;
      });
      if (myPlayer) myPlayer.hp = state.playerHp;

      GameAudio.stopBgm(true);
      if (iWon) GameAudio.victory();
      else GameAudio.defeat();

      if (!iWon && !state._eliminated)
        Effects.showToast("KAU KALAH!", "error", 2000);

      setTimeout(function () {
        UI.showResult({
          victory: iWon,
          wpm: calcWpm(),
          accuracy: calcAcc(),
          maxCombo: state.maxCombo,
          score: state.score,
          mpWinner: data.winnerId,
          mpPlayers: allPlayers,
        });
      }, 1200);
    });

    Multiplayer.on("player_progress", function () {
      updateMpSidebar();
      renderHpBars();
    });

    Multiplayer.on("player_typing", function (data) {
      var ind = document.getElementById("typingIndicators");
      if (!ind) return;
      var dot = document.getElementById("ind-" + data.playerId);
      if (!dot) {
        dot = document.createElement("div");
        dot.id = "ind-" + data.playerId;
        dot.style.cssText =
          "font-size:9px;color:var(--t3);display:inline-block;margin-right:8px;";
        dot.textContent = (data.name || "?") + " mengetik...";
        ind.appendChild(dot);
      }
      clearTimeout(dot._t);
      dot._t = setTimeout(function () {
        if (dot.parentElement) dot.remove();
      }, 1600);
    });

    Multiplayer.on("hp_update", function (data) {
      var myId = Multiplayer.getPlayerId();
      if (data.playerId === myId) {
        var incoming = Math.max(0, data.hp);
        if (incoming < state.playerHp) {
          state.playerHp = incoming;
          renderHpBars();
          if (state.playerHp <= 0 && !state._eliminated && !state._endingMp) {
            _handleMpDeath();
          }
        }
        return;
      }
      var allPlayers = Multiplayer.getPlayers();
      var target = allPlayers.find(function (p) {
        return p.id === data.playerId;
      });
      if (target) target.hp = data.hp;
      updateMpSidebar();
      renderHpBars();
      if (!state._endingMp) _checkAndBroadcastWin();
    });

    Multiplayer.on("players_update", function () {
      updateMpSidebar();
      renderHpBars();
      if (!state._endingMp) _checkAndBroadcastWin();
    });

    Multiplayer.on("damage_dealt", function (data) {
      var myId = Multiplayer.getPlayerId();
      if (data.to !== myId) return;
      if (!state.running || state._eliminated || state._endingMp) return;
      state.playerHp = Math.max(0, state.playerHp - data.amount);
      Multiplayer.updatePlayerHp(myId, state.playerHp);
      renderHpBars();
      Effects.damageFlash();
      GameAudio.playerHit();
      Effects.showToast(
        "Lawan serang kamu! -" + data.amount + " HP",
        "error",
        1400,
      );
      if (state.playerHp <= 0 && !state._eliminated && !state._endingMp)
        _handleMpDeath();
    });

    updateMpSidebar();
  }

  function updateMpSidebar() {
    var list = document.getElementById("mpPlayerList");
    if (!list) return;
    var myId = Multiplayer.getPlayerId();
    list.innerHTML = Multiplayer.getPlayers()
      .map(function (p) {
        var hp = typeof p.hp === "number" ? p.hp : PLAYER_MAX_HP;
        var hpPct = Math.max(0, Math.min(100, (hp / PLAYER_MAX_HP) * 100));
        var hpColor =
          hp > 100
            ? "var(--g)"
            : hp > 60
              ? "var(--o)"
              : hp > 0
                ? "var(--r)"
                : "#444";
        var deadTag = hp <= 0 ? " 💀" : "";
        return (
          '<div class="mp-prow" style="' +
          (hp <= 0 ? "opacity:0.4;" : "") +
          '"><span class="mp-pname">' +
          p.name +
          (p.id === myId ? " (YOU)" : "") +
          deadTag +
          '</span><div class="mp-hpw"><div class="mp-hpf" style="width:' +
          hpPct +
          "%;background:" +
          hpColor +
          '"></div></div>' +
          '<span class="mp-wpm">' +
          (p.wpm || 0) +
          " WPM</span></div>"
        );
      })
      .join("");
  }

  function endGame(victory) {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.timerInterval);
    clearInterval(state.winCheckInterval);
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    state._bots.forEach(clearInterval);
    if (state.multiplayer) Multiplayer.stopBots();
    GameAudio.stopBgm(true);
    if (victory) GameAudio.victory();
    else GameAudio.defeat();
    setTimeout(function () {
      UI.showResult({
        victory: victory,
        wpm: calcWpm(),
        accuracy: calcAcc(),
        maxCombo: state.maxCombo,
        score: state.score,
      });
    }, 800);
  }

  function getState() {
    return {
      mode: state.mode,
      wave: state.wave,
      score: state.score,
      playerHp: state.playerHp,
      running: state.running,
      combo: state.combo,
      maxCombo: state.maxCombo,
      totalChars: state.totalChars,
      correctChars: state.correctChars,
      multiplayer: state.multiplayer,
    };
  }

  return {
    init,
    handleInput,
    handleVirtualKey,
    activateSkill,
    getState,
    endGame,
    setupMultiplayer,
  };
})();
