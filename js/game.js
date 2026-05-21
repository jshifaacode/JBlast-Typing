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
    startTime: null,
    currentWord: "",
    typedIndex: 0,
    enemies: [],
    running: false,
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
    _eliminated: false,
    _endingMp: false,
    _gameOverHandled: false,
    _lastHpPushed: 200,
    _hpPushTimer: null,
  };

  var PLAYER_MAX_HP = 200;
  var MP_DURATION = 120;
  var HP_PUSH_THROTTLE = 120;

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

  function _resetState(mode, skin, firstWord) {
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
    state.startTime = Date.now();
    state.running = false;
    state.gameTimer = 0;
    state.enemies = [];
    state._firstWord = firstWord || null;
    state._bots = [];
    state._botCompleted = false;
    state.wordCount = 0;
    state.multiplayer = false;
    state._eliminated = false;
    state._endingMp = false;
    state._gameOverHandled = false;
    state._lastHpPushed = PLAYER_MAX_HP;
    clearTimeout(state._hpPushTimer);
    state._hpPushTimer = null;
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  function _stopAllTimers() {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    clearTimeout(state._hpPushTimer);
    state._hpPushTimer = null;
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    state._bots.forEach(clearInterval);
    state._bots = [];
  }

  function init(mode, skin, firstWord) {
    _resetState(mode, skin, firstWord);
    ["Overdrive", "Freeze", "Burn"].forEach(function (sk) {
      var btn = document.getElementById("skill" + sk);
      if (btn) {
        btn.disabled = true;
        btn.classList.remove("ready-glow");
      }
      var cd = document.getElementById("cd" + sk);
      if (cd) cd.style.transform = "scaleX(0)";
    });
    var inp = document.getElementById("gameInput");
    if (inp) {
      inp.value = "";
      inp.disabled = false;
    }
    var ind = document.getElementById("typingIndicators");
    if (ind) ind.innerHTML = "";
    showCountdown(function () {
      state.running = true;
      spawnWave();
      startTimer();
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
    var ov = document.getElementById("cdOverlay");
    var nums = ["3", "2", "1", "GO!"];
    var i = 0;
    function tick() {
      if (!ov || !ov.parentElement) {
        cb();
        return;
      }
      if (i >= nums.length) {
        ov.parentElement.innerHTML = "";
        cb();
        return;
      }
      ov.innerHTML =
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

    if (state.multiplayer) {
      var wd = document.getElementById("waveDisplay");
      if (wd) wd.textContent = "MP";
      nextWord();
      return;
    }

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
    if (state.mode === "solo") spawnBots();
    nextWord();
  }

  function spawnBots() {
    state._bots.forEach(clearInterval);
    state._bots = [];
    state._botCompleted = false;
    var botDefs = [
      { n: "CYPHER_X", av: '<i class="fa-solid fa-robot"></i>' },
      { n: "VOID_RUNNER", av: '<i class="fa-solid fa-ghost"></i>' },
    ];
    var count = Math.min(state.wave, 2);
    var word = state.currentWord || "";
    var chars = word.replace(/ /g, "").length || 1;
    botDefs.slice(0, count).forEach(function (b) {
      var speed = 0.38 + state.wave * 0.12 + Math.random() * 0.25;
      var typed = 0;
      var delay = Math.floor(1000 / (speed * 4));
      var iv = setInterval(
        function () {
          if (!state.running) {
            clearInterval(iv);
            return;
          }
          if (typed >= chars) {
            clearInterval(iv);
            if (!state._botCompleted) {
              state._botCompleted = true;
              onBotDone(b);
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

  function onBotDone(bot) {
    if (!state.running) return;
    var dmg = 15 + state.wave * 2;
    state.playerHp = Math.max(0, state.playerHp - dmg);
    renderHpBars();
    Effects.damageFlash();
    GameAudio.playerHit();
    Effects.showToast(
      bot.n + " selesai duluan! -" + dmg + " HP",
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
    var delay =
      (e.frozen ? e.attackDelay * 2.5 : e.attackDelay) *
      (0.75 + Math.random() * 0.5);
    e.attackTimer = setTimeout(function () {
      if (!state.running || e.hp <= 0) return;
      doEnemyAttack(e);
      scheduleAttack(e);
    }, delay);
  }

  function doEnemyAttack(e) {
    if (!state.running) return;
    var dmg = state.skills.overdrive.active
      ? Math.floor(e.attackDmg * 0.5)
      : e.attackDmg;
    _applyDamageToSelf(dmg, true);
    var card = document.getElementById("enemy-" + e.id);
    if (card) {
      var f = document.createElement("div");
      f.className = "enemy-attack-flash";
      card.appendChild(f);
      setTimeout(function () {
        if (f.parentElement) f.remove();
      }, 200);
    }
  }

  function _applyDamageToSelf(dmg, fromEnemy) {
    if (!state.running && !state._eliminated) return;
    state.playerHp = Math.max(0, state.playerHp - dmg);
    renderHpBars();
    if (fromEnemy) {
      Effects.damageFlash();
      GameAudio.playerHit();
    }
    _schedulePushHp();
    if (state.playerHp <= 0 && !state._eliminated) {
      if (state.multiplayer) _handleMpDeath();
      else endGame(false);
    }
  }

  function _schedulePushHp() {
    if (!state.multiplayer) return;
    clearTimeout(state._hpPushTimer);
    state._hpPushTimer = setTimeout(function () {
      var hp = Math.max(0, Math.ceil(state.playerHp));
      if (hp !== state._lastHpPushed) {
        state._lastHpPushed = hp;
        Multiplayer.pushMyHp(hp);
      }
    }, HP_PUSH_THROTTLE);
  }

  function _handleMpDeath() {
    if (state._eliminated) return;
    state._eliminated = true;
    state.running = false;
    _stopAllTimers();
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
    var wp = document.querySelector(".word-panel");
    if (wp) {
      wp.style.opacity = "0.3";
      wp.style.pointerEvents = "none";
    }
    state._lastHpPushed = 0;
    Multiplayer.pushMyHp(0);
    Effects.showToast("KAU GUGUR! Menunggu hasil akhir...", "error", 3000);
  }

  function _finishMp(iWon, winnerId, allPlayers) {
    if (state._endingMp) return;
    state._endingMp = true;
    state._gameOverHandled = true;
    state.running = false;
    _stopAllTimers();
    var inp = document.getElementById("gameInput");
    if (inp) inp.disabled = true;
    var wp = document.querySelector(".word-panel");
    if (wp) {
      wp.style.opacity = "1";
      wp.style.pointerEvents = "";
    }
    var myId = Multiplayer.getPlayerId();
    var me = allPlayers.find(function (p) {
      return p.id === myId;
    });
    if (me)
      me.hp = state._eliminated ? 0 : Math.max(0, Math.ceil(state.playerHp));
    GameAudio.stopBgm(true);
    if (iWon) GameAudio.victory();
    else GameAudio.defeat();
    setTimeout(function () {
      UI.showResult({
        victory: iWon,
        wpm: calcWpm(),
        accuracy: calcAcc(),
        maxCombo: state.maxCombo,
        score: state.score,
        mpWinner: winnerId,
        mpPlayers: allPlayers,
      });
    }, 400);
  }

  function nextWord() {
    state._botCompleted = false;
    state._bots.forEach(clearInterval);
    state._bots = [];
    if (state._firstWord) {
      state.currentWord = state._firstWord;
      state._firstWord = null;
    } else if (state.multiplayer) {
      var wc = state.wordCount;
      if (wc < 5) state.currentWord = Words.getEasy();
      else if (wc < 12) state.currentWord = Words.getMedium();
      else state.currentWord = Words.getHard();
    } else {
      var hasBoss = state.enemies.some(function (e) {
        return e.isBoss;
      });
      if (hasBoss) {
        var boss = state.enemies.find(function (e) {
          return e.isBoss;
        });
        state.currentWord =
          boss && boss.phase === 1 ? Words.getBoss() : Words.getHard();
      } else {
        state.currentWord = Words.getByWave(state.wave);
      }
    }
    state.typedIndex = 0;
    renderWord();
    var inp = document.getElementById("gameInput");
    if (inp) {
      inp.value = "";
      if (!isMobile())
        setTimeout(function () {
          inp.focus();
        }, 50);
    }
    if (state.mode === "solo") spawnBots();
    updateMobileHL();
  }

  function renderWord() {
    var el = document.getElementById("targetWord");
    if (!el) return;
    var panel = document.querySelector(".word-panel");
    if (panel) {
      panel.classList.remove(
        "skin-fire",
        "skin-lightning",
        "skin-glitch",
        "skin-ice",
      );
      if (state.skin && state.skin !== "default")
        panel.classList.add("skin-" + state.skin);
    }
    el.innerHTML = state.currentWord
      .split("")
      .map(function (c, i) {
        if (c === " ")
          return '<span class="char" data-i="' + i + '">\u00a0</span>';
        var cls =
          i < state.typedIndex
            ? "char correct"
            : i === state.typedIndex
              ? "char active"
              : "char pending";
        return '<span class="' + cls + '" data-i="' + i + '">' + c + "</span>";
      })
      .join("");
  }

  function handleInput(e) {
    if (!state.running) {
      e.target.value = "";
      return;
    }
    var typed = e.target.value;
    var last = typed[typed.length - 1];
    if (!last) {
      state.typedIndex = 0;
      renderWord();
      return;
    }
    _processChar(last, e.target);
  }

  function handleVirtualKey(key) {
    if (!state.running) return;
    if (key === "BACK") {
      if (state.typedIndex > 0) {
        state.typedIndex--;
        renderWord();
      }
      return;
    }
    _processChar(key === " " ? " " : key.toLowerCase(), null);
  }

  function _processChar(k, inputEl) {
    var expected = state.currentWord[state.typedIndex];
    state.totalChars++;
    if (k === expected) {
      state.correctChars++;
      state.typedIndex++;
      GameAudio.keyCorrect();
      var ch = document.querySelector(
        '[data-i="' + (state.typedIndex - 1) + '"]',
      );
      if (ch) {
        ch.className = "char correct";
        Effects.typeEffect(ch, state.skin);
      }
      if (state.typedIndex < state.currentWord.length) {
        var nx = document.querySelector('[data-i="' + state.typedIndex + '"]');
        if (nx) nx.className = "char active";
      }
      updateMobileHL();
      if (state.multiplayer) {
        Multiplayer.pushMyProgress(
          state.typedIndex / state.currentWord.length,
          calcWpm(),
        );
        if (state.typedIndex % 3 === 0) Multiplayer.sendTyping();
      }
      if (state.typedIndex >= state.currentWord.length)
        setTimeout(onWordDone, 0);
    } else {
      state.combo = 0;
      updateCombo();
      GameAudio.keyError();
      Effects.screenShake(3, 120);
      if (inputEl) {
        inputEl.classList.add("wrong-char");
        setTimeout(function () {
          inputEl.classList.remove("wrong-char");
        }, 200);
        setTimeout(function () {
          inputEl.value = "";
        }, 40);
      }
      var chw = document.querySelector('[data-i="' + state.typedIndex + '"]');
      if (chw) {
        chw.className = "char wrong";
        setTimeout(function () {
          if (chw.className === "char wrong") chw.className = "char active";
        }, 280);
      }
      _applyDamageToSelf(2, false);
    }
    updateStats();
  }

  function onWordDone() {
    if (!state.running) return;
    state._bots.forEach(clearInterval);
    state._bots = [];
    state.wordCount++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    GameAudio.wordComplete();
    Effects.comboEffect(state.combo);
    GameAudio.comboUp(state.combo);
    updateCombo();
    if (state.wordCount % 3 === 0) unlockSkill();
    var mult = state.skills.overdrive.active ? 2 : 1;
    var comboDmg = Math.min(state.combo, 12) * 2;
    var baseDmg = 20 + comboDmg;

    if (state.multiplayer) {
      var myId = Multiplayer.getPlayerId();
      var opponents = Multiplayer.getPlayers().filter(function (p) {
        return p.id !== myId && (p.hp || 0) > 0;
      });
      if (opponents.length > 0) {
        var oppDmg = Math.floor((18 + comboDmg) * mult);
        opponents.forEach(function (opp) {
          var newHp = Math.max(0, (opp.hp || 0) - oppDmg);
          opp.hp = newHp;
          Multiplayer.pushOpponentHp(opp.id, newHp);
        });
        Effects.showToast("Serang lawan! -" + oppDmg + " HP", "warning", 1400);
        renderHpBars();
      }
      var healAmt = 6 + Math.min(state.combo - 1, 6) * 2;
      state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmt);
      renderHpBars();
      clearTimeout(state._hpPushTimer);
      state._hpPushTimer = setTimeout(function () {
        var hp = Math.max(0, Math.ceil(state.playerHp));
        state._lastHpPushed = hp;
        Multiplayer.pushMyHp(hp);
      }, HP_PUSH_THROTTLE);
    } else {
      var alive = state.enemies.filter(function (e) {
        return e.hp > 0;
      });
      if (alive.length > 0) {
        var target = alive[Math.floor(Math.random() * alive.length)];
        dmgEnemy(target, Math.floor(baseDmg * mult));
      }
      state.score += (12 + comboDmg) * mult;
      var heal = 6 + Math.min(state.combo - 1, 6) * 2;
      state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + heal);
      renderHpBars();
      if (
        state.enemies.every(function (e) {
          return e.hp <= 0;
        })
      ) {
        onWaveClear();
        return;
      }
    }
    setTimeout(nextWord, 180);
  }

  function dmgEnemy(e, amount) {
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - amount);
    var pct = (e.hp / e.maxHp) * 100;
    var hpEl = document.getElementById("hp-" + e.id);
    if (hpEl) {
      hpEl.style.width = pct + "%";
      hpEl.style.background =
        pct < 30 ? "var(--r)" : pct < 60 ? "var(--o)" : "";
    }
    var card = document.getElementById("enemy-" + e.id);
    if (card) Effects.showDamageNumber(card, amount);
    GameAudio.hit();
    if (e.isBoss) {
      if (e.hp < e.maxHp * 0.66 && e.phase === 1) {
        e.phase = 2;
        e.attackDelay *= 0.75;
        Effects.showToast("BOSS PHASE 2 — FASTER!", "warning");
      } else if (e.hp < e.maxHp * 0.33 && e.phase === 2) {
        e.phase = 3;
        e.attackDelay *= 0.6;
        Effects.showToast("BOSS PHASE 3 — ALL OUT!", "warning");
      }
      var phEl = document.getElementById("phase-" + e.id);
      if (phEl) phEl.textContent = "PHASE " + e.phase;
    }
    if (e.hp <= 0) {
      var card2 = document.getElementById("enemy-" + e.id);
      if (card2) {
        Effects.killEffect(card2);
        card2.style.opacity = "0";
        card2.style.transform = "scale(0)";
        card2.style.transition = "all .3s";
        setTimeout(function () {
          if (card2.parentElement) card2.remove();
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
    GameAudio.victory();
    state.enemies.forEach(function (e) {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });
    if (state.wave > 6) {
      endGame(true);
      return;
    }
    Effects.showToast("WAVE " + state.wave + " INCOMING!", "warning", 1200);
    setTimeout(spawnWave, 1600);
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
          Effects.showToast("SKILL READY: " + sk.toUpperCase(), "info");
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
      GameAudio.overdrive();
      Effects.showToast("OVERDRIVE — DMG x2!", "warning");
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
      GameAudio.freeze();
      Effects.showToast("ENEMIES FROZEN — 5 DETIK!", "info");
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
      GameAudio.burn();
      Effects.showToast("BURN — DOT DAMAGE!", "warning");
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
      cdEl.style.transform = "scaleX(" + Math.min(1, el / ms) + ")";
      state.skills[name].cooldown = ms - el;
      if (el >= ms) {
        clearInterval(iv);
        state.skills[name].cooldown = 0;
        cdEl.style.transform = "scaleX(0)";
        btn.disabled = false;
        btn.classList.add("ready-glow");
        Effects.showToast(name.toUpperCase() + " READY!", "info");
      }
    }, 50);
  }

  function startTimer() {
    clearInterval(state.timerInterval);
    state.gameTimer = 0;
    state.timerInterval = setInterval(function () {
      if (!state.running) return;
      state.gameTimer++;
      var el = document.getElementById("gameTimer");
      if (state.multiplayer && MP_DURATION > 0) {
        var rem = MP_DURATION - state.gameTimer;
        if (rem <= 0) {
          _endMpByTime();
          return;
        }
        var rm = Math.floor(rem / 60)
          .toString()
          .padStart(2, "0");
        var rs = (rem % 60).toString().padStart(2, "0");
        if (el) el.textContent = rm + ":" + rs;
        if (rem === 30) Effects.showToast("30 DETIK LAGI!", "warning");
        if (rem === 10) Effects.showToast("10 DETIK!", "warning");
      } else {
        var m = Math.floor(state.gameTimer / 60)
          .toString()
          .padStart(2, "0");
        var s = (state.gameTimer % 60).toString().padStart(2, "0");
        if (el) el.textContent = m + ":" + s;
      }
    }, 1000);
  }

  function _endMpByTime() {
    if (state._endingMp || state._gameOverHandled) return;
    state._gameOverHandled = true;
    state.running = false;
    clearInterval(state.timerInterval);
    Effects.showToast("WAKTU HABIS!", "warning");
    var myId = Multiplayer.getPlayerId();
    var allPl = Multiplayer.getPlayers();
    var me = allPl.find(function (p) {
      return p.id === myId;
    });
    if (me) me.hp = Math.ceil(state.playerHp);
    var sorted = allPl.slice().sort(function (a, b) {
      return (b.hp || 0) - (a.hp || 0);
    });
    Multiplayer.broadcastGameOver(sorted[0] ? sorted[0].id : null);
  }

  function setupMultiplayer() {
    state.multiplayer = true;
    state._eliminated = false;
    state._endingMp = false;
    state._gameOverHandled = false;
    state._lastHpPushed = PLAYER_MAX_HP;
    var sb = document.getElementById("mpSidebar");
    if (sb) sb.style.display = "block";

    Multiplayer.on("game_over", function (data) {
      if (state._endingMp || state._gameOverHandled) return;
      var myId = Multiplayer.getPlayerId();
      var iWon = data.winnerId === myId;
      var allPl =
        data.players && data.players.length > 0
          ? data.players
          : Multiplayer.getPlayers();
      _finishMp(iWon, data.winnerId, allPl);
    });

    Multiplayer.on("hp_sync", function (data) {
      updateMpSidebar();
      renderHpBars();
    });

    Multiplayer.on("players_update", function () {
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

    updateMpSidebar();
  }

  function updateMpSidebar() {
    var list = document.getElementById("mpPlayerList");
    if (!list) return;
    var myId = Multiplayer.getPlayerId();
    var myDisplayHp = Math.max(0, Math.ceil(state.playerHp));
    list.innerHTML = Multiplayer.getPlayers()
      .map(function (p) {
        var hp =
          p.id === myId
            ? myDisplayHp
            : Math.max(
                0,
                Math.ceil(typeof p.hp === "number" ? p.hp : PLAYER_MAX_HP),
              );
        var pct = Math.max(0, Math.min(100, (hp / PLAYER_MAX_HP) * 100));
        var col =
          hp > 100
            ? "var(--g)"
            : hp > 60
              ? "var(--o)"
              : hp > 0
                ? "var(--r)"
                : "#444";
        var dead = hp <= 0 ? " 💀" : "";
        return (
          '<div class="mp-prow" style="' +
          (hp <= 0 ? "opacity:0.4;" : "") +
          '">' +
          '<span class="mp-pname">' +
          p.name +
          (p.id === myId ? " (YOU)" : "") +
          dead +
          "</span>" +
          '<div class="mp-hpw"><div class="mp-hpf" style="width:' +
          pct +
          "%;background:" +
          col +
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
    _stopAllTimers();
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

  function renderHpBars() {
    var c = document.getElementById("hpBars");
    if (!c) return;
    var myHp = Math.max(0, Math.ceil(state.playerHp));
    var pPct = Math.max(0, (myHp / state.maxPlayerHp) * 100);
    var pStyle =
      pPct <= 30
        ? "background:var(--r)"
        : pPct <= 60
          ? "background:var(--o)"
          : "";
    var html =
      '<div class="hpbar">' +
      '<div class="hpbar-row"><span class="hpbar-name">YOU</span><span class="hpbar-val">' +
      myHp +
      "/" +
      state.maxPlayerHp +
      "</span></div>" +
      '<div class="hpbar-track"><div class="hpbar-fill p" style="width:' +
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
          var oh = Math.max(
            0,
            Math.ceil(typeof p.hp === "number" ? p.hp : PLAYER_MAX_HP),
          );
          var oPct = Math.max(0, Math.min(100, (oh / PLAYER_MAX_HP) * 100));
          var oStyle = oh <= 0 ? "opacity:0.4;" : "";
          html +=
            '<div class="hpbar" style="' +
            oStyle +
            '">' +
            '<div class="hpbar-row"><span class="hpbar-name">' +
            p.name +
            (oh <= 0 ? " 💀" : "") +
            '</span><span class="hpbar-val">' +
            oh +
            "/" +
            PLAYER_MAX_HP +
            "</span></div>" +
            '<div class="hpbar-track"><div class="hpbar-fill o" style="width:' +
            oPct +
            '%"></div></div></div>';
        });
    } else {
      state.enemies.forEach(function (e) {
        var pct = Math.max(0, (e.hp / e.maxHp) * 100);
        html +=
          '<div class="hpbar">' +
          '<div class="hpbar-row"><span class="hpbar-name">' +
          e.name +
          '</span><span class="hpbar-val">' +
          Math.ceil(e.hp) +
          "/" +
          e.maxHp +
          "</span></div>" +
          '<div class="hpbar-track"><div class="hpbar-fill e" style="width:' +
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
      eliminated: state._eliminated,
      ending: state._endingMp,
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
