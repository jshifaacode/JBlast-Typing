const Game = (() => {
  let state = {
    mode: 'solo',
    wave: 1,
    score: 0,
    playerHp: 100,
    maxPlayerHp: 100,
    combo: 0,
    maxCombo: 0,
    totalChars: 0,
    correctChars: 0,
    wrongChars: 0,
    startTime: null,
    wordStartTime: null,
    currentWord: '',
    displayWord: '',
    typedIndex: 0,
    enemies: [],
    running: false,
    paused: false,
    gameTimer: 0,
    timerInterval: null,
    attackInterval: null,
    skills: { overdrive: { active: false, cooldown: 0 }, freeze: { active: false, cooldown: 0 }, burn: { active: false, cooldown: 0 } },
    multiplayer: false,
    skin: 'default'
  };

  const ENEMIES = [
    { id: 'bot', name: 'ROGUE BOT', avatar: '🤖', maxHp: 80, phase: 1, attackDmg: 10, attackDelay: 5000 },
    { id: 'virus', name: 'VIRUS.EXE', avatar: '🦠', maxHp: 120, phase: 1, attackDmg: 15, attackDelay: 4000 },
    { id: 'boss', name: 'SYSTEM BOSS', avatar: '💀', maxHp: 300, phase: 1, attackDmg: 25, attackDelay: 3000, isBoss: true },
    { id: 'glitch', name: 'GLITCH_GHOST', avatar: '👾', maxHp: 100, phase: 1, attackDmg: 12, attackDelay: 4500 },
    { id: 'phantom', name: 'PHANTOM.SYS', avatar: '🕷️', maxHp: 200, phase: 1, attackDmg: 20, attackDelay: 3500 }
  ];

  function init(mode, skin) {
    state.mode = mode;
    state.skin = skin || 'default';
    state.wave = 1;
    state.score = 0;
    state.playerHp = 100;
    state.maxPlayerHp = 100;
    state.combo = 0;
    state.maxCombo = 0;
    state.totalChars = 0;
    state.correctChars = 0;
    state.wrongChars = 0;
    state.startTime = Date.now();
    state.running = true;
    state.gameTimer = 0;
    state.enemies = [];
    Object.keys(state.skills).forEach(k => {
      state.skills[k].active = false;
      state.skills[k].cooldown = 0;
    });
    spawnWave();
    startTimers();
    renderHpBars();
    renderSkillBar();
  }

  function spawnWave() {
    const enemyZone = document.getElementById('enemyZone');
    enemyZone.innerHTML = '';
    state.enemies = [];

    const waveConfig = {
      1: [ENEMIES[0]],
      2: [ENEMIES[0], ENEMIES[3]],
      3: [ENEMIES[1], ENEMIES[3]],
      4: [ENEMIES[1], ENEMIES[0], ENEMIES[3]],
      5: [ENEMIES[4]],
      6: [ENEMIES[2]]
    };

    const config = waveConfig[Math.min(state.wave, 6)] || [ENEMIES[1], ENEMIES[3]];

    config.forEach(template => {
      const enemy = {
        ...template,
        hp: template.maxHp * (1 + (state.wave - 1) * 0.2),
        maxHp: template.maxHp * (1 + (state.wave - 1) * 0.2),
        phase: 1,
        frozen: false,
        burning: false,
        burnTick: null,
        attackTimer: null
      };
      enemy.hp = Math.floor(enemy.hp);
      enemy.maxHp = Math.floor(enemy.maxHp);
      state.enemies.push(enemy);
      renderEnemy(enemy);
      scheduleEnemyAttack(enemy);
    });

    document.getElementById('waveDisplay').textContent = `WAVE ${state.wave}`;
    nextWord();
  }

  function renderEnemy(enemy) {
    const zone = document.getElementById('enemyZone');
    const card = document.createElement('div');
    card.className = 'enemy-card';
    card.id = `enemy-${enemy.id}`;
    card.innerHTML = `
      <div class="enemy-avatar">${enemy.avatar}</div>
      <div class="enemy-name">${enemy.name}</div>
      <div class="enemy-phase" id="phase-${enemy.id}">PHASE ${enemy.phase}</div>
      <div class="enemy-hp-track">
        <div class="enemy-hp-fill" id="hp-${enemy.id}" style="width:100%"></div>
      </div>
    `;
    zone.appendChild(card);
  }

  function scheduleEnemyAttack(enemy) {
    if (!state.running) return;
    const delay = enemy.frozen ? enemy.attackDelay * 2.5 : enemy.attackDelay;
    enemy.attackTimer = setTimeout(() => {
      if (!state.running || enemy.hp <= 0) return;
      doEnemyAttack(enemy);
      scheduleEnemyAttack(enemy);
    }, delay * (0.8 + Math.random() * 0.4));
  }

  function doEnemyAttack(enemy) {
    if (!state.running) return;
    const dmg = state.skills.overdrive.active ? Math.floor(enemy.attackDmg * 0.5) : enemy.attackDmg;
    state.playerHp = Math.max(0, state.playerHp - dmg);

    Effects.damageFlash();
    Audio.playerHit();
    renderHpBars();

    const card = document.getElementById(`enemy-${enemy.id}`);
    if (card) {
      const flash = document.createElement('div');
      flash.className = 'enemy-attack-flash';
      card.appendChild(flash);
      setTimeout(() => flash.remove(), 200);
    }

    if (state.multiplayer) {
      Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);
    }

    if (state.playerHp <= 0) endGame(false);
  }

  function nextWord() {
    const isBossWave = state.wave >= 6;
    const isBoss = state.enemies.some(e => e.isBoss);

    if (isBoss && state.enemies[0]) {
      const boss = state.enemies.find(e => e.isBoss);
      if (boss) {
        if (boss.phase === 1) state.currentWord = Words.getBoss().toLowerCase().split(' ')[0];
        else if (boss.phase === 2) state.displayWord = Words.glitch(Words.getHard());
        else if (boss.phase === 3) state.displayWord = Words.hideChars(Words.getHard());
        else state.currentWord = Words.getHard();

        if (boss.phase === 1) state.displayWord = state.currentWord;
        else if (boss.phase !== 2 && boss.phase !== 3) state.displayWord = state.currentWord;
      }
    } else {
      state.currentWord = Words.getByWave(state.wave);
      state.displayWord = state.currentWord;
    }

    state.typedIndex = 0;
    state.wordStartTime = Date.now();
    renderWord();

    const input = document.getElementById('gameInput');
    if (input) { input.value = ''; input.focus(); }

    if (state.multiplayer) {
      Multiplayer.startBotSimulation(state.currentWord);
    }
  }

  function renderWord() {
    const el = document.getElementById('targetWord');
    if (!el) return;
    el.innerHTML = state.displayWord.split('').map((c, i) => {
      if (c === ' ') return `<span class="char" data-i="${i}"> </span>`;
      let cls = 'char pending';
      if (i < state.typedIndex) cls = 'char correct';
      else if (i === state.typedIndex) cls = 'char active';
      return `<span class="${cls}" data-i="${i}">${c}</span>`;
    }).join('');
  }

  function handleInput(e) {
    if (!state.running || state.paused) return;

    const input = e.target;
    const typed = input.value;
    const lastChar = typed[typed.length - 1];

    if (!lastChar) {
      state.typedIndex = 0;
      renderWord();
      return;
    }

    const expected = state.currentWord[state.typedIndex];
    state.totalChars++;

    if (lastChar === expected) {
      state.correctChars++;
      state.typedIndex++;
      Audio.keyCorrect();

      const charEl = document.querySelector(`[data-i="${state.typedIndex - 1}"]`);
      if (charEl) {
        charEl.className = 'char correct';
        Effects.typeEffect(charEl, state.skin);
      }
      if (state.typedIndex < state.displayWord.length) {
        const next = document.querySelector(`[data-i="${state.typedIndex}"]`);
        if (next) next.className = 'char active';
      }

      updateMobileHighlight();

      if (state.multiplayer) {
        const progress = state.typedIndex / state.currentWord.length;
        Multiplayer.sendProgress(progress, calculateWPM());
        if (state.typedIndex % 3 === 0) Multiplayer.sendTyping();
      }

      if (state.typedIndex >= state.currentWord.length) {
        onWordComplete();
      }
    } else {
      state.wrongChars++;
      state.combo = 0;
      updateComboDisplay();

      const dmg = 5;
      state.playerHp = Math.max(0, state.playerHp - dmg);
      renderHpBars();

      Audio.keyError();
      Effects.screenShake(4, 150);
      input.classList.add('wrong-char');
      setTimeout(() => input.classList.remove('wrong-char'), 200);

      const charEl = document.querySelector(`[data-i="${state.typedIndex}"]`);
      if (charEl) {
        charEl.className = 'char wrong';
        setTimeout(() => {
          charEl.className = 'char active';
        }, 300);
      }

      setTimeout(() => { input.value = ''; }, 50);

      if (state.playerHp <= 0) { endGame(false); return; }
    }

    updateLiveStats();
  }

  function onWordComplete() {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    Audio.wordComplete();
    Effects.comboEffect(state.combo);
    updateComboDisplay();

    const wpm = calculateWPM();
    const dmgMultiplier = state.skills.overdrive.active ? 2 : 1;
    const comboDmg = Math.min(state.combo, 10) * 2;

    const activeEnemies = state.enemies.filter(e => e.hp > 0);
    if (activeEnemies.length > 0) {
      const target = activeEnemies[Math.floor(Math.random() * activeEnemies.length)];
      const baseDmg = 20 + comboDmg;
      const dmg = Math.floor(baseDmg * dmgMultiplier);
      damageEnemy(target, dmg);
    }

    state.score += (10 + comboDmg) * dmgMultiplier;

    if (state.combo >= 3 && state.combo % 3 === 0) {
      unlockSkill();
    }

    const allDead = state.enemies.every(e => e.hp <= 0);
    if (allDead) {
      onWaveClear();
    } else {
      setTimeout(nextWord, 200);
    }
  }

  function damageEnemy(enemy, amount) {
    if (enemy.hp <= 0) return;
    const prevHp = enemy.hp;
    enemy.hp = Math.max(0, enemy.hp - amount);

    const pct = (enemy.hp / enemy.maxHp) * 100;
    const hpEl = document.getElementById(`hp-${enemy.id}`);
    if (hpEl) {
      hpEl.style.width = pct + '%';
      if (pct < 30) hpEl.style.background = '#ff2244';
      else if (pct < 60) hpEl.style.background = '#ff8800';
    }

    const card = document.getElementById(`enemy-${enemy.id}`);
    if (card) Effects.showDamageNumber(card, amount);

    Audio.hit();

    if (enemy.isBoss) {
      const prevPhase = enemy.phase;
      if (enemy.hp < enemy.maxHp * 0.66 && enemy.phase === 1) {
        enemy.phase = 2;
        Effects.showToast('⚠️ BOSS PHASE 2 — WORD GLITCH ACTIVATED!', 'warning');
      }
      if (enemy.hp < enemy.maxHp * 0.33 && enemy.phase === 2) {
        enemy.phase = 3;
        Effects.showToast('🚨 BOSS PHASE 3 — CHARACTERS HIDDEN!', 'warning');
      }
      const phaseEl = document.getElementById(`phase-${enemy.id}`);
      if (phaseEl) phaseEl.textContent = `PHASE ${enemy.phase}`;
    }

    if (enemy.hp <= 0) {
      const card = document.getElementById(`enemy-${enemy.id}`);
      if (card) {
        Effects.killEffect(card);
        card.style.opacity = '0';
        card.style.transform = 'scale(0)';
        card.style.transition = 'all 0.3s';
        setTimeout(() => card.remove(), 300);
      }
      clearTimeout(enemy.attackTimer);
      if (enemy.burnTick) clearInterval(enemy.burnTick);
    }
  }

  function onWaveClear() {
    state.wave++;
    state.score += 100 * state.wave;
    Effects.showToast(`✅ WAVE ${state.wave - 1} CLEARED! +${100 * (state.wave - 1)} SCORE`, 'success');
    Audio.victory();

    state.enemies.forEach(e => { clearTimeout(e.attackTimer); if (e.burnTick) clearInterval(e.burnTick); });

    if (state.wave > 6) {
      endGame(true);
    } else {
      setTimeout(spawnWave, 1500);
    }
  }

  function unlockSkill() {
    const skills = ['overdrive', 'freeze', 'burn'];
    for (const sk of skills) {
      if (!state.skills[sk].active && state.skills[sk].cooldown === 0) {
        const btn = document.getElementById(`skill${sk.charAt(0).toUpperCase() + sk.slice(1)}`);
        if (btn) {
          btn.disabled = false;
          btn.style.borderColor = 'var(--accent2)';
          Effects.showToast(`⚡ SKILL READY: ${sk.toUpperCase()}`, 'info');
        }
        break;
      }
    }
  }

  function activateSkill(skillName) {
    const skill = state.skills[skillName];
    if (!skill || skill.cooldown > 0) return;

    if (skillName === 'overdrive') {
      skill.active = true;
      document.body.classList.add('overdrive');
      Audio.overdrive();
      Effects.showToast('⚡ OVERDRIVE ACTIVATED — DMG x2!', 'warning');
      setTimeout(() => {
        skill.active = false;
        document.body.classList.remove('overdrive');
        setCooldown('overdrive', 20000);
      }, 5000);
    }

    if (skillName === 'freeze') {
      state.enemies.forEach(e => {
        e.frozen = true;
        const card = document.getElementById(`enemy-${e.id}`);
        if (card) card.classList.add('frozen');
        setTimeout(() => {
          e.frozen = false;
          if (card) card.classList.remove('frozen');
        }, 4000);
      });
      Audio.freeze();
      Effects.showToast('❄️ ENEMIES FROZEN!', 'info');
      setCooldown('freeze', 18000);
    }

    if (skillName === 'burn') {
      state.enemies.forEach(e => {
        if (e.hp > 0) {
          e.burning = true;
          const card = document.getElementById(`enemy-${e.id}`);
          if (card) card.classList.add('burning');
          let ticks = 0;
          e.burnTick = setInterval(() => {
            if (!state.running || e.hp <= 0 || ticks >= 8) {
              clearInterval(e.burnTick);
              e.burning = false;
              if (card) card.classList.remove('burning');
              return;
            }
            damageEnemy(e, 8);
            ticks++;
          }, 500);
        }
      });
      Audio.burn();
      Effects.showToast('🔥 BURN ACTIVATED — DOT DAMAGE!', 'warning');
      setCooldown('burn', 15000);
    }

    const btn = document.getElementById(`skill${skillName.charAt(0).toUpperCase() + skillName.slice(1)}`);
    if (btn) btn.disabled = true;
  }

  function setCooldown(skillName, ms) {
    state.skills[skillName].cooldown = ms;
    const cdEl = document.getElementById(`cd${skillName.charAt(0).toUpperCase() + skillName.slice(1)}`);
    const btn = document.getElementById(`skill${skillName.charAt(0).toUpperCase() + skillName.slice(1)}`);
    if (!cdEl || !btn) return;

    const start = Date.now();
    btn.disabled = true;

    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = elapsed / ms;
      cdEl.style.transform = `scaleX(${pct})`;
      state.skills[skillName].cooldown = ms - elapsed;

      if (elapsed >= ms) {
        clearInterval(tick);
        state.skills[skillName].cooldown = 0;
        cdEl.style.transform = 'scaleX(0)';
        btn.disabled = false;
        btn.style.borderColor = '';
        Effects.showToast(`⚡ ${skillName.toUpperCase()} READY!`, 'info');
      }
    }, 50);
  }

  function startTimers() {
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (!state.running || state.paused) return;
      state.gameTimer++;
      const m = Math.floor(state.gameTimer / 60).toString().padStart(2, '0');
      const s = (state.gameTimer % 60).toString().padStart(2, '0');
      const el = document.getElementById('gameTimer');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  }

  function calculateWPM() {
    const elapsed = (Date.now() - state.startTime) / 60000;
    if (elapsed < 0.01) return 0;
    return Math.floor((state.correctChars / 5) / elapsed);
  }

  function calculateAccuracy() {
    if (state.totalChars === 0) return 100;
    return Math.floor((state.correctChars / state.totalChars) * 100);
  }

  function updateLiveStats() {
    const wpm = calculateWPM();
    const acc = calculateAccuracy();
    const wpmEl = document.getElementById('liveWpm');
    const accEl = document.getElementById('liveAcc');
    if (wpmEl) wpmEl.textContent = `${wpm} WPM`;
    if (accEl) accEl.textContent = `${acc}%`;
  }

  function updateComboDisplay() {
    const el = document.getElementById('comboDisplay');
    const text = document.getElementById('comboText');
    if (!el || !text) return;
    if (state.combo >= 2) {
      el.style.display = 'block';
      text.textContent = `COMBO x${state.combo}`;
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = 'comboPulse 0.3s ease-out';
    } else {
      el.style.display = 'none';
    }
  }

  function renderHpBars() {
    const container = document.getElementById('hpBars');
    if (!container) return;

    let html = `
      <div class="hp-bar-item">
        <div class="hp-bar-label">
          <span>YOU</span>
          <span>${state.playerHp}/${state.maxPlayerHp}</span>
        </div>
        <div class="hp-bar-track">
          <div class="hp-bar-fill player" style="width:${(state.playerHp / state.maxPlayerHp) * 100}%"></div>
        </div>
      </div>
    `;

    state.enemies.forEach(e => {
      const pct = Math.max(0, (e.hp / e.maxHp) * 100);
      html += `
        <div class="hp-bar-item">
          <div class="hp-bar-label">
            <span>${e.avatar} ${e.name}</span>
            <span>${Math.floor(e.hp)}/${e.maxHp}</span>
          </div>
          <div class="hp-bar-track">
            <div class="hp-bar-fill enemy" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderSkillBar() {
    ['overdrive', 'freeze', 'burn'].forEach(sk => {
      const btn = document.getElementById(`skill${sk.charAt(0).toUpperCase() + sk.slice(1)}`);
      if (btn) btn.disabled = true;
    });
  }

  function endGame(victory) {
    state.running = false;
    clearInterval(state.timerInterval);
    state.enemies.forEach(e => {
      clearTimeout(e.attackTimer);
      if (e.burnTick) clearInterval(e.burnTick);
    });

    if (state.multiplayer) Multiplayer.stopBots();

    const wpm = calculateWPM();
    const acc = calculateAccuracy();

    if (victory) Audio.victory();
    else Audio.defeat();

    setTimeout(() => {
      UI.showResult({
        victory,
        wpm,
        accuracy: acc,
        maxCombo: state.maxCombo,
        score: state.score
      });
    }, 800);
  }

  function getState() { return { ...state }; }

  function updateMobileHighlight() {
    const nextChar = state.currentWord[state.typedIndex];
    if (!nextChar) return;
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.classList.remove('highlight');
      if (btn.dataset.key === nextChar.toUpperCase()) btn.classList.add('highlight');
    });
  }

  function handleMobileKey(key) {
    const input = document.getElementById('gameInput');
    if (!input) return;
    if (key === 'BACK') {
      input.value = input.value.slice(0, -1);
    } else {
      input.value += key.toLowerCase();
    }
    input.dispatchEvent(new Event('input'));
  }

  function setupMultiplayer() {
    state.multiplayer = true;
    document.getElementById('mpSidebar').style.display = 'block';

    Multiplayer.on('player_progress', ({ playerId, progress, wpm }) => {
      updateMpSidebar();
    });

    Multiplayer.on('player_typing', ({ playerId, name }) => {
      const ind = document.getElementById('typingIndicators');
      if (!ind) return;
      let dot = document.getElementById(`indicator-${playerId}`);
      if (!dot) {
        dot = document.createElement('div');
        dot.id = `indicator-${playerId}`;
        dot.className = 'typing-indicator';
        dot.innerHTML = `<div class="typing-indicator-dot"></div><span>${name} is typing...</span>`;
        ind.appendChild(dot);
      }
      clearTimeout(dot._timeout);
      dot._timeout = setTimeout(() => dot.remove(), 1500);
    });

    Multiplayer.on('player_word_complete', ({ playerId: pid }) => {
      const player = Multiplayer.getPlayers().find(p => p.id === pid);
      if (player) Effects.showToast(`${player.avatar || ''} ${player.name} completed the word!`, 'info');
    });

    Multiplayer.on('hp_update', ({ playerId: pid, hp }) => {
      updateMpSidebar();
    });

    updateMpSidebar();
  }

  function updateMpSidebar() {
    const list = document.getElementById('mpPlayerList');
    if (!list) return;
    const myId = Multiplayer.getPlayerId();
    list.innerHTML = Multiplayer.getPlayers().map(p => {
      const hpColor = p.hp > 60 ? 'var(--green)' : p.hp > 30 ? '#ff8800' : 'var(--red)';
      return `
        <div class="mp-player-row">
          <div class="mp-player-info">
            <span class="mp-player-avatar">${p.avatar || '⚡'}</span>
            <span class="mp-player-name">${p.name}${p.id === myId ? ' (YOU)' : ''}</span>
          </div>
          <div class="mp-player-hp">
            <div class="mp-player-hp-fill" style="width:${p.hp || 100}%;background:${hpColor}"></div>
          </div>
          <div class="mp-player-wpm">${p.wpm || 0} WPM</div>
          <div class="mp-player-typing">${Math.floor((p.progress || 0) * 100)}% complete</div>
        </div>
      `;
    }).join('');
  }

  return {
    init, handleInput, activateSkill, getState, endGame,
    handleMobileKey, setupMultiplayer
  };
})();
