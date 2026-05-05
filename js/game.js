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
    mpTimerEl: null,
  };

  var PLAYER_MAX_HP = 200;
  var MP_DURATION = 300;

  var ENEMIES = [
    {
      id: "bot",
      name: "ROGUE BOT",
      avatar: "🤖",
      maxHp: 80,
      attackDmg: 5,
      attackDelay: 12000,
    },
    {
      id: "virus",
      name: "VIRUS.EXE",
      avatar: "🦠",
      maxHp: 100,
      attackDmg: 7,
      attackDelay: 11000,
    },
    {
      id: "boss",
      name: "SYSTEM BOSS",
      avatar: "💀",
      maxHp: 180,
      attackDmg: 10,
      attackDelay: 9000,
      isBoss: true,
    },
    {
      id: "glitch",
      name: "GLITCH_GHOST",
      avatar: "👾",
      maxHp: 90,
      attackDmg: 6,
      attackDelay: 11000,
    },
    {
      id: "phantom",
      name: "PHANTOM.SYS",
      avatar: "🕷️",
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

    clearInterval(state.timerInterval);

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
        avatar: tmpl.avatar,
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
      { n: "CYPHER_X", a: "🤖" },
      { n: "VOID_RUNNER", a: "👾" },
      { n: "GHOST_42", a: "💀" },
    ];
    var count = Math.min(state.wave, 2);
    var bots = botNames.slice(0, count).map(function (b, i) {
      return {
        id: "bot_" + i,
        name: b.n,
        avatar: b.a,
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
    Audio.playerHit();
    Effects.showToast(
      bot.avatar + " " + bot.name + " selesai duluan! -" + dmg + " HP",
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
      e.avatar +
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
    Audio.playerHit();
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
      if (state.multiplayer) endMp(false);
      else endGame(false);
    }
  }

  function nextWord() {
    state._botCompleted = false;
    state._bots.forEach(clearInterval);
    state._bots = [];

    if (state._firstWord) {
      state.currentWord = state._firstWord;
      state.displayWord = state._firstWord;
      state._firstWord = null;
    } else {
      var hasBoss = state.enemies.some(function (e) {
        return e.isBoss;
      });
      if (hasBoss) {
        var boss = state.enemies.find(function (e) {
          return e.isBoss;
        });
        if (boss) {
          if (boss.phase === 1) state.currentWord = Words.getBoss();
          else state.currentWord = Words.getHard();
          state.displayWord = state.currentWord;
        }
      } else {
        state.currentWord = Words.getByWave(state.wave);
        state.displayWord = state.currentWord;
      }
    }

    state.typedIndex = 0;
    renderWord();

    var inp = document.getElementById("gameInput");
    if (inp) {
      inp.value = "";
      if (!isMobile()) inp.focus();
    }

    if (state.multiplayer) Multiplayer.startBotSimulation(state.currentWord);
    else spawnBotOpponents();

    updateMobileHL();
  }

  function renderWord() {
    var el = document.getElementById("targetWord");
    if (!el) return;
    el.innerHTML = state.displayWord
      .split("")
      .map(function (c, i) {
        if (c === " ")
          return '<span class="char" data-i="' + i + '">&nbsp;</span>';
        var cls = "char pending";
        if (i < state.typedIndex) cls = "char correct";
        else if (i === state.typedIndex) cls = "char active";
        return '<span class="' + cls + '" data-i="' + i + '">' + c + "</span>";
      })
      .join("");
  }

  function handleInput(e) {
    if (!state.running || state.paused) {
      e.target.value = "";
      return;
    }
    var input = e.target;
    var typed = input.value;
    var lastChar = typed[typed.length - 1];
    if (!lastChar) {
      state.typedIndex = 0;
      renderWord();
      return;
    }
    var expected = state.currentWord[state.typedIndex];
    state.totalChars++;

    if (lastChar === expected) {
      state.correctChars++;
      state.typedIndex++;
      Audio.keyCorrect();

      var ch = document.querySelector(
        '[data-i="' + (state.typedIndex - 1) + '"]',
      );
      if (ch) {
        ch.className = "char correct";
        Effects.typeEffect(ch, state.skin);
      }

      if (state.typedIndex < state.displayWord.length) {
        var nx = document.querySelector('[data-i="' + state.typedIndex + '"]');
        if (nx) nx.className = "char active";
      }

      updateMobileHL();

      if (state.multiplayer) {
        Multiplayer.sendProgress(
          state.typedIndex / state.currentWord.length,
          calcWpm(),
        );
        if (state.typedIndex % 3 === 0) Multiplayer.sendTyping();
      }

      if (state.typedIndex >= state.currentWord.length) {
        setTimeout(onWordDone, 0);
      }
    } else {
      state.wrongChars++;
      state.combo = 0;
      updateCombo();
      state.playerHp = Math.max(0, state.playerHp - 2);
      renderHpBars();
      Audio.keyError();
      Effects.screenShake(3, 120);

      input.classList.add("wrong-char");
      setTimeout(function () {
        input.classList.remove("wrong-char");
      }, 200);

      var chw = document.querySelector('[data-i="' + state.typedIndex + '"]');
      if (chw) {
        chw.className = "char wrong";
        setTimeout(function () {
          if (chw.className === "char wrong") chw.className = "char active";
        }, 280);
      }

      setTimeout(function () {
        input.value = "";
      }, 40);

      if (state.multiplayer)
        Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);

      if (state.playerHp <= 0) {
        if (state.multiplayer) endMp(false);
        else endGame(false);
        return;
      }
    }
    updateStats();
  }

  function handleVirtualKey(key) {
    if (!state.running || state.paused) return;
    if (key === "BACK") {
      if (state.typedIndex > 0) {
        state.typedIndex--;
        renderWord();
      }
      return;
    }
    var k = key === " " ? " " : key.toLowerCase();
    var expected = state.currentWord[state.typedIndex];
    state.totalChars++;

    if (k === expected) {
      state.correctChars++;
      state.typedIndex++;
      Audio.keyCorrect();

      var ch = document.querySelector(
        '[data-i="' + (state.typedIndex - 1) + '"]',
      );
      if (ch) {
        ch.className = "char correct";
        Effects.typeEffect(ch, state.skin);
      }
      if (state.typedIndex < state.displayWord.length) {
        var nx = document.querySelector('[data-i="' + state.typedIndex + '"]');
        if (nx) nx.className = "char active";
      }
      updateMobileHL();

      if (state.multiplayer) {
        Multiplayer.sendProgress(
          state.typedIndex / state.currentWord.length,
          calcWpm(),
        );
        if (state.typedIndex % 3 === 0) Multiplayer.sendTyping();
      }

      if (state.typedIndex >= state.currentWord.length) {
        setTimeout(onWordDone, 0);
      }
    } else {
      state.wrongChars++;
      state.combo = 0;
      updateCombo();
      state.playerHp = Math.max(0, state.playerHp - 2);
      renderHpBars();
      Audio.keyError();
      Effects.screenShake(3, 100);

      if (state.multiplayer)
        Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);

      if (state.playerHp <= 0) {
        if (state.multiplayer) endMp(false);
        else endGame(false);
        return;
      }
    }
    updateStats();
  }

  function onWordDone() {
    if (!state.running) return;
    state._bots.forEach(clearInterval);
    state._bots = [];
    state._botCompleted = true;
    state.wordCount++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    Audio.wordComplete();
    Effects.comboEffect(state.combo);
    Audio.comboUp(state.combo);
    updateCombo();

    var mult = state.skills.overdrive.active ? 2 : 1;
    var comboDmg = Math.min(state.combo, 12) * 2;
    var baseDmg = 20 + comboDmg;

    var alive = state.enemies.filter(function (e) {
      return e.hp > 0;
    });
    if (alive.length > 0) {
      var target = alive[Math.floor(Math.random() * alive.length)];
      dmgEnemy(target, Math.floor(baseDmg * mult));
    }

    state.score += (12 + comboDmg) * mult;

    var healAmt = 6 + Math.min(state.combo - 1, 6) * 2;
    var prevHp = state.playerHp;
    state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmt);
    var healed = state.playerHp - prevHp;
    if (healed > 0) renderHpBars();

    if (state.combo >= 3 && state.combo % 3 === 0) unlockSkill();

    if (state.multiplayer) {
      Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);
      Multiplayer.sendProgress(1, calcWpm());

      var myId = Multiplayer.getPlayerId();
      var opponents = Multiplayer.getPlayers().filter(function (p) {
        return p.id !== myId;
      });
      if (opponents.length > 0) {
        var oppDmg = Math.floor((18 + comboDmg) * mult);
        opponents.forEach(function (opp) {
          Multiplayer.sendDamage(opp.id, oppDmg);
        });
        Effects.showToast(
          "⚡ Serang lawan! -" + oppDmg + " HP",
          "warning",
          1400,
        );
      }
    }

    if (
      state.enemies.every(function (e) {
        return e.hp <= 0;
      })
    ) {
      onWaveClear();
    } else {
      setTimeout(nextWord, 180);
    }
  }

  function dmgEnemy(e, amount) {
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - amount);
    var pct = (e.hp / e.maxHp) * 100;
    var hpEl = document.getElementById("hp-" + e.id);
    if (hpEl) {
      hpEl.style.width = pct + "%";
      if (pct < 30) hpEl.style.background = "var(--r)";
      else if (pct < 60) hpEl.style.background = "var(--o)";
      else hpEl.style.background = "";
    }
    var card = document.getElementById("enemy-" + e.id);
    if (card) Effects.showDamageNumber(card, amount);
    Audio.hit();

    if (e.isBoss) {
      if (e.hp < e.maxHp * 0.66 && e.phase === 1) {
        e.phase = 2;
        Effects.showToast("⚠️ BOSS PHASE 2 — FASTER ATTACKS!", "warning");
        e.attackDelay = e.attackDelay * 0.75;
      }
      if (e.hp < e.maxHp * 0.33 && e.phase === 2) {
        e.phase = 3;
        Effects.showToast("🚨 BOSS PHASE 3 — ALL OUT!", "warning");
        e.attackDelay = e.attackDelay * 0.6;
      }
      var phEl = document.getElementById("phase-" + e.id);
      if (phEl) phEl.textContent = "PHASE " + e.phase;
    }

    if (e.hp <= 0) {
      if (card) {
        Effects.killEffect(card);
        card.style.opacity = "0";
        card.style.transform = "scale(0)";
        card.style.transition = "all .3s";
        setTimeout(function () {
          if (card.parentElement) card.remove();
        }, 300);
      }
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    }

    renderHpBars();
  }

  function onWaveClear() {
    state.wave++;
    state.score += 100 * (state.wave - 1);
    Effects.showToast(
      "WAVE " +
        (state.wave - 1) +
        " CLEAR! +" +
        100 * (state.wave - 1) +
        " SCORE",
      "success",
    );
    Audio.victory();
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });

    if (state.wave > 6) {
      endGame(true);
    } else {
      Effects.showToast(
        "⚡ WAVE " + state.wave + " INCOMING!",
        "warning",
        1200,
      );
      setTimeout(spawnWave, 1600);
    }
  }

  function unlockSkill() {
    var skills = ["overdrive", "freeze", "burn"];
    for (var i = 0; i < skills.length; i++) {
      var sk = skills[i];
      if (!state.skills[sk].active && state.skills[sk].cooldown === 0) {
        var cap = sk.charAt(0).toUpperCase() + sk.slice(1);
        var btn = document.getElementById("skill" + cap);
        if (btn && btn.disabled) {
          btn.disabled = false;
          btn.classList.add("ready-glow");
          Effects.showToast("⚡ SKILL READY: " + sk.toUpperCase(), "info");
          break;
        }
      }
    }
  }

  function activateSkill(name) {
    var skill = state.skills[name];
    if (!skill || skill.cooldown > 0 || !state.running) return;
    var cap = name.charAt(0).toUpperCase() + name.slice(1);
    var btn = document.getElementById("skill" + cap);
    if (btn && btn.disabled) return;

    if (name === "overdrive") {
      skill.active = true;
      document.body.classList.add("overdrive");
      Audio.overdrive();
      Effects.showToast("⚡ OVERDRIVE — DMG x2!", "warning");
      setTimeout(function () {
        skill.active = false;
        document.body.classList.remove("overdrive");
        setCooldown("overdrive", 20000);
      }, 6000);
    }

    if (name === "freeze") {
      state.enemies.forEach(function (e) {
        e.frozen = true;
        var c = document.getElementById("enemy-" + e.id);
        if (c) c.classList.add("frozen");
        setTimeout(function () {
          e.frozen = false;
          if (c) c.classList.remove("frozen");
        }, 5000);
      });
      Audio.freeze();
      Effects.showToast("❄️ ENEMIES FROZEN — 5 DETIK!", "info");
      setCooldown("freeze", 18000);
    }

    if (name === "burn") {
      state.enemies.forEach(function (e) {
        if (e.hp <= 0) return;
        e.burning = true;
        var c = document.getElementById("enemy-" + e.id);
        if (c) c.classList.add("burning");
        var ticks = 0;
        e.burnTick = setInterval(function () {
          if (!state.running || e.hp <= 0 || ticks >= 10) {
            clearInterval(e.burnTick);
            e.burning = false;
            if (c) c.classList.remove("burning");
            return;
          }
          dmgEnemy(e, 9);
          ticks++;
        }, 500);
      });
      Audio.burn();
      Effects.showToast("🔥 BURN — DOT DAMAGE!", "warning");
      setCooldown("burn", 15000);
    }

    if (btn) btn.disabled = true;
  }

  function setCooldown(name, ms) {
    state.skills[name].cooldown = ms;
    var cap = name.charAt(0).toUpperCase() + name.slice(1);
    var cdEl = document.getElementById("cd" + cap);
    var btn = document.getElementById("skill" + cap);
    if (!cdEl || !btn) return;
    btn.disabled = true;
    btn.classList.remove("ready-glow");
    var start = Date.now();
    var iv = setInterval(function () {
      var el = Date.now() - start;
      var pct = el / ms;
      cdEl.style.transform = "scaleX(" + pct + ")";
      state.skills[name].cooldown = ms - el;
      if (el >= ms) {
        clearInterval(iv);
        state.skills[name].cooldown = 0;
        cdEl.style.transform = "scaleX(0)";
        btn.disabled = false;
        btn.classList.add("ready-glow");
        Effects.showToast("⚡ " + name.toUpperCase() + " READY!", "info");
      }
    }, 50);
  }

  function startTimers() {
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(function () {
      if (!state.running || state.paused) return;
      state.gameTimer++;
      var m = Math.floor(state.gameTimer / 60)
        .toString()
        .padStart(2, "0");
      var s = (state.gameTimer % 60).toString().padStart(2, "0");
      var el = document.getElementById("gameTimer");
      if (el) el.textContent = m + ":" + s;

      if (state.multiplayer && state.mpTimeLimit > 0) {
        var remaining = state.mpTimeLimit - state.gameTimer;
        if (remaining <= 0) {
          endMpByTime();
          return;
        }
        var rm = Math.floor(remaining / 60)
          .toString()
          .padStart(2, "0");
        var rs = (remaining % 60).toString().padStart(2, "0");
        if (el) el.textContent = rm + ":" + rs;
        if (remaining === 30) Effects.showToast("⏰ 30 DETIK LAGI!", "warning");
        if (remaining === 10) Effects.showToast("⏰ 10 DETIK!", "warning");
      }
    }, 1000);
  }

  function endMpByTime() {
    if (!state.running) return;
    var myId = Multiplayer.getPlayerId();
    var allPlayers = Multiplayer.getPlayers();
    var myPlayer = allPlayers.find(function (p) {
      return p.id === myId;
    });
    if (myPlayer) myPlayer.hp = state.playerHp;

    var sorted = allPlayers.slice().sort(function (a, b) {
      return (b.hp || 0) - (a.hp || 0);
    });
    var winner = sorted[0];
    var iWon = winner && winner.id === myId;

    Effects.showToast("⏰ WAKTU HABIS!", "warning");
    endMp(iWon, winner ? winner.id : null);
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
      "%;" +
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
          html +=
            '<div class="hpbar"><div class="hpbar-row"><span class="hpbar-name">' +
            (p.avatar || "⚡") +
            " " +
            p.name +
            '</span><span class="hpbar-val">' +
            Math.ceil(oppHp) +
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
          e.avatar +
          " " +
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
    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "block";

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
      if (!state.running) return;
      var myId = Multiplayer.getPlayerId();
      if (data.playerId === myId) {
        var incoming = Math.max(0, data.hp);
        if (incoming < state.playerHp) {
          state.playerHp = incoming;
          renderHpBars();
          if (state.playerHp <= 0) {
            endMp(false);
            return;
          }
        }
        return;
      }
      updateMpSidebar();
      renderHpBars();
      var allPlayers = Multiplayer.getPlayers();
      var opponents = allPlayers.filter(function (p) {
        return p.id !== myId;
      });
      var allDead =
        opponents.length > 0 &&
        opponents.every(function (p) {
          return (p.hp || 0) <= 0;
        });
      if (allDead) endMp(true);
    });

    Multiplayer.on("damage_dealt", function (data) {
      var myId = Multiplayer.getPlayerId();
      if (data.to !== myId) return;
      if (!state.running) return;
      state.playerHp = Math.max(0, state.playerHp - data.amount);
      Multiplayer.updatePlayerHp(myId, state.playerHp);
      renderHpBars();
      Effects.damageFlash();
      Audio.playerHit();
      Effects.showToast(
        "💥 Lawan serang kamu! -" + data.amount + " HP",
        "error",
        1400,
      );
      if (state.playerHp <= 0) endMp(false);
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
        var hpColor = hp > 100 ? "var(--g)" : hp > 60 ? "var(--o)" : "var(--r)";
        return (
          '<div class="mp-prow">' +
          '<span class="mp-pav">' +
          (p.avatar || "⚡") +
          "</span>" +
          '<span class="mp-pname">' +
          p.name +
          (p.id === myId ? " (YOU)" : "") +
          "</span>" +
          '<div class="mp-hpw"><div class="mp-hpf" style="width:' +
          hpPct +
          "%;background:" +
          hpColor +
          '"></div></div>' +
          '<span class="mp-wpm">' +
          (p.wpm || 0) +
          " WPM</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function endMp(iWon, forcedWinnerId) {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.timerInterval);
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    state._bots.forEach(clearInterval);
    Multiplayer.stopBots();
    Audio.stopBgm(true);

    var wpm = calcWpm(),
      acc = calcAcc();
    var allPlayers = Multiplayer.getPlayers();
    var myId = Multiplayer.getPlayerId();
    var myPlayer = allPlayers.find(function (p) {
      return p.id === myId;
    });
    if (myPlayer) myPlayer.hp = state.playerHp;

    var winnerId = forcedWinnerId || null;
    if (!winnerId) {
      if (iWon) {
        winnerId = myId;
      } else {
        var alive = allPlayers.filter(function (p) {
          return p.id !== myId && (p.hp || 0) > 0;
        });
        if (alive.length > 0) {
          winnerId = alive.reduce(function (a, b) {
            return (a.hp || 0) > (b.hp || 0) ? a : b;
          }).id;
        }
      }
    }

    if (iWon) Audio.victory();
    else Audio.defeat();
    setTimeout(function () {
      UI.showResult({
        victory: iWon,
        wpm: wpm,
        accuracy: acc,
        maxCombo: state.maxCombo,
        score: state.score,
        mpWinner: winnerId,
        mpPlayers: allPlayers,
      });
    }, 800);
  }

  function endGame(victory) {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.timerInterval);
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    state._bots.forEach(clearInterval);
    if (state.multiplayer) Multiplayer.stopBots();
    Audio.stopBgm(true);
    if (victory) Audio.victory();
    else Audio.defeat();
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
    init: init,
    handleInput: handleInput,
    handleVirtualKey: handleVirtualKey,
    activateSkill: activateSkill,
    getState: getState,
    endGame: endGame,
    endMp: endMp,
    setupMultiplayer: setupMultiplayer,
  };
})();
