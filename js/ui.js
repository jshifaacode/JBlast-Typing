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
      const select = () => {
        grid.querySelectorAll('.avatar-item').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      };

      opt.addEventListener('click', select);
      opt.addEventListener('touchstart', select); // 🔥 FIX MOBILE
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
      <div class="skin-option${i === 0 ? ' selected' : ''}" data-skin="${s.id}">
        ${s.label}
      </div>
    `).join('');

    el.querySelectorAll('.skin-option').forEach(opt => {
      opt.addEventListener('click', () => {
        el.querySelectorAll('.skin-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  }

  function updateMenuDisplay(profile) {
    document.getElementById('menuUsername').textContent = profile.name;
    document.getElementById('menuAvatar').textContent = profile.avatar;
  }

  return { showScreen, buildAvatarGrid, buildSkinOptions, updateMenuDisplay };
})();
