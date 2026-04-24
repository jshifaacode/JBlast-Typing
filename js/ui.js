const UI = (() => {
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const target = document.getElementById(id);
    if (target) {
      target.style.display = 'flex';
      setTimeout(() => target.classList.add('active'), 10);
    }
  }

  function buildAvatarGrid() {
  const avatars = ['⚡','💀','🔥','👾','🤖','🦾','🧬','💥','🛸','🔮','🌀','⚔️'];
  const grid = document.getElementById('avatarGrid');
  if (!grid) return;

  grid.innerHTML = avatars.map((a, i) => `
    <div class="avatar-item${i === 0 ? ' selected' : ''}" data-avatar="${a}">
      ${a}
    </div>
  `).join('');

  grid.querySelectorAll('.avatar-item').forEach(opt => {
    opt.addEventListener('click', () => {
      grid.querySelectorAll('.avatar-item').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

  function buildSkinOptions() {
    const skins = [
      { id: 'default', label: '◈ DEFAULT' },
      { id: 'fire', label: '🔥 FIRE' },
      { id: 'lightning', label: '⚡ LIGHTNING' },
      { id: 'glitch', label: '💀 GLITCH' },
      { id: 'ice', label: '❄️ ICE' }
    ];
    const el = document.getElementById('skinOptions');
    if (!el) return;
    el.innerHTML = skins.map((s, i) => `
      <div class="skin-option${i === 0 ? ' selected' : ''}" data-skin="${s.id}">${s.label}</div>
    `).join('');
    el.querySelectorAll('.skin-option').forEach(opt => {
      opt.addEventListener('click', () => {
        el.querySelectorAll('.skin-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  }

  function updateMenuDisplay(profile) {
    const el = document.getElementById('menuUsername');
    const av = document.getElementById('menuAvatar');
    const lvl = document.getElementById('menuLevel');
    const xpFill = document.getElementById('xpFill');
    if (el) el.textContent = profile.name || 'PLAYER';
    if (av) av.textContent = profile.avatar || '⚡';
    if (lvl) lvl.textContent = `LVL ${profile.level || 1}`;

    const xpForLevel = (profile.level || 1) * 500;
    const xpInLevel = (profile.xp || 0) % xpForLevel;
    if (xpFill) xpFill.style.width = `${(xpInLevel / xpForLevel) * 100}%`;

    const stats = profile.stats || {};
    const wpmEl = document.getElementById('statWpm');
    const accEl = document.getElementById('statAcc');
    const winsEl = document.getElementById('statWins');
    if (wpmEl) wpmEl.textContent = stats.bestWpm || 0;
    if (accEl) accEl.textContent = `${stats.bestAcc || 0}%`;
    if (winsEl) winsEl.textContent = stats.wins || 0;
  }

  function buildLobby(players, isHost, roomCode) {
    document.getElementById('lobbyCode').textContent = roomCode;
    const container = document.getElementById('lobbyPlayers');
    container.innerHTML = '';

    players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = `lobby-player${i === 0 ? ' host' : ''}`;
      div.innerHTML = `
        <span class="lobby-player-avatar">${p.avatar || '⚡'}</span>
        <span class="lobby-player-name">${p.name}</span>
        ${i === 0 ? '<span class="lobby-player-badge">HOST</span>' : ''}
      `;
      container.appendChild(div);
    });

    const startBtn = document.getElementById('btnStartMatch');
    if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';
  }

  function buildMobileKeyboard() {
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M','BACK']
    ];
    const kb = document.getElementById('mobileKeyboard');
    if (!kb) return;
    kb.innerHTML = '';
    rows.forEach(row => {
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = `key-btn${key === 'BACK' ? ' key-wide' : ''}`;
        btn.textContent = key === 'BACK' ? '⌫' : key;
        btn.dataset.key = key;
        btn.addEventListener('click', () => {
          Game.handleMobileKey(key === 'BACK' ? 'BACK' : key);
          Audio.keyPress();
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 100);
          if (navigator.vibrate) navigator.vibrate(10);
        });
        kb.appendChild(btn);
      });
    });
  }

  function showResult({ victory, wpm, accuracy, maxCombo, score }) {
    const profile = App.getProfile();
    const xpEarned = Math.floor(score / 10) + (victory ? 200 : 50);
    profile.xp = (profile.xp || 0) + xpEarned;
    profile.level = Math.floor(profile.xp / 500) + 1;
    profile.stats = profile.stats || {};
    if (wpm > (profile.stats.bestWpm || 0)) profile.stats.bestWpm = wpm;
    if (accuracy > (profile.stats.bestAcc || 0)) profile.stats.bestAcc = accuracy;
    if (maxCombo > (profile.stats.bestCombo || 0)) profile.stats.bestCombo = maxCombo;
    if (score > (profile.stats.bestScore || 0)) profile.stats.bestScore = score;
    profile.stats.totalMatches = (profile.stats.totalMatches || 0) + 1;
    if (victory) profile.stats.wins = (profile.stats.wins || 0) + 1;
    App.saveProfile(profile);

    let rank = 'F';
    if (accuracy >= 95 && wpm >= 80) rank = 'S';
    else if (accuracy >= 85 && wpm >= 60) rank = 'A';
    else if (accuracy >= 75 && wpm >= 40) rank = 'B';
    else if (accuracy >= 60) rank = 'C';

    document.getElementById('resultTitle').textContent = victory ? '🏆 MISSION COMPLETE' : '💀 SYSTEM FAILURE';
    const rankEl = document.getElementById('resultRank');
    rankEl.textContent = rank;
    rankEl.className = `result-rank ${rank}`;
    document.getElementById('rWpm').textContent = wpm;
    document.getElementById('rAcc').textContent = `${accuracy}%`;
    document.getElementById('rCombo').textContent = maxCombo;
    document.getElementById('rScore').textContent = score.toLocaleString();
    document.getElementById('rXp').textContent = `+${xpEarned}`;

    showScreen('screen-result');
  }

  function buildStats(stats) {
    const el = document.getElementById('statsGrid');
    if (!el) return;
    const items = [
      { label: 'BEST WPM', value: stats.bestWpm || 0 },
      { label: 'BEST ACCURACY', value: `${stats.bestAcc || 0}%` },
      { label: 'BEST COMBO', value: stats.bestCombo || 0 },
      { label: 'BEST SCORE', value: (stats.bestScore || 0).toLocaleString() },
      { label: 'TOTAL MATCHES', value: stats.totalMatches || 0 },
      { label: 'WIN RATE', value: stats.totalMatches ? `${Math.floor((stats.wins || 0) / stats.totalMatches * 100)}%` : '0%' },
    ];
    el.innerHTML = items.map(i => `
      <div class="stat-block">
        <div class="stat-block-label">${i.label}</div>
        <div class="stat-block-value">${i.value}</div>
      </div>
    `).join('');
  }

  return { showScreen, buildAvatarGrid, buildSkinOptions, updateMenuDisplay, buildLobby, buildMobileKeyboard, showResult, buildStats };
})();
