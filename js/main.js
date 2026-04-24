const App = (() => {
  let profile = null;
  const STORAGE_KEY = 'keystorm_profile';

  function getProfile() {
    if (!profile) {
      const saved = localStorage.getItem(STORAGE_KEY);
      profile = saved ? JSON.parse(saved) : { name: '', avatar: '⚡', skin: 'default', xp: 0, level: 1, stats: {} };
    }
    return profile;
  }

  function saveProfile(p) {
    profile = p;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 600;
  }

  function bootSequence() {
    const lines = [
      '> KEYSTORM OS v3.7 LOADING...',
      '> NEURAL TYPING ENGINE: ONLINE',
      '> COMBAT PROTOCOLS: ACTIVATED',
      '> MULTIPLAYER STACK: READY',
      '> AUDIO SUBSYSTEM: INITIALIZED',
      '> WELCOME, OPERATOR.',
    ];
    const el = document.getElementById('bootLines');
    let i = 0;
    const add = () => {
      if (i >= lines.length) return;
      el.innerHTML += lines[i] + '\n';
      i++;
      setTimeout(add, 300 + Math.random() * 200);
    };
    add();
  }

  function startSolo() {
    const p = getProfile();
    UI.showScreen('screen-game');
    const kb = document.getElementById('mobileKeyboard');
    if (isMobile()) {
      if (kb) kb.style.display = 'grid';
      UI.buildMobileKeyboard();
      const input = document.getElementById('gameInput');
      if (input) input.style.display = 'none';
    } else {
      if (kb) kb.style.display = 'none';
      const input = document.getElementById('gameInput');
      if (input) input.style.display = 'flex';
      setTimeout(() => document.getElementById('gameInput')?.focus(), 100);
    }
    document.getElementById('mpSidebar').style.display = 'none';
    Game.init('solo', p.skin);
  }

  function startMultiplayerGame() {
    const p = getProfile();
    UI.showScreen('screen-game');
    const kb = document.getElementById('mobileKeyboard');
    if (isMobile()) {
      if (kb) kb.style.display = 'grid';
      UI.buildMobileKeyboard();
    } else {
      if (kb) kb.style.display = 'none';
      setTimeout(() => document.getElementById('gameInput')?.focus(), 100);
    }
    Game.init('multiplayer', p.skin);
    Game.setupMultiplayer();
  }

  function bindEvents() {
    document.getElementById('btnEnterGame').addEventListener('click', () => {
      Audio.keyPress();
      const p = getProfile();
      if (p.name) {
        UI.updateMenuDisplay(p);
        UI.showScreen('screen-menu');
      } else {
        UI.showScreen('screen-login');
        UI.buildAvatarGrid();
        UI.buildSkinOptions();
      }
    });

    document.getElementById('btnConfirmLogin').addEventListener('click', () => {
      const name = document.getElementById('inputUsername').value.trim();
      if (!name) { Effects.showToast('Enter your callsign!', 'error'); return; }
      const avatar = document.querySelector('.avatar-option.selected')?.dataset.avatar || '⚡';
      const skin = document.querySelector('.skin-option.selected')?.dataset.skin || 'default';
      const p = getProfile();
      p.name = name;
      p.avatar = avatar;
      p.skin = skin;
      saveProfile(p);
      UI.updateMenuDisplay(p);
      Audio.wordComplete();
      UI.showScreen('screen-menu');
    });

    document.getElementById('btnSolo').addEventListener('click', () => {
      Audio.keyPress();
      startSolo();
    });

    document.getElementById('btnMultiplayer').addEventListener('click', () => {
      Audio.keyPress();
      UI.showScreen('screen-multiplayer');
    });

    document.getElementById('btnStats').addEventListener('click', () => {
      Audio.keyPress();
      const p = getProfile();
      UI.buildStats(p.stats || {});
      UI.showScreen('screen-stats');
    });

    document.getElementById('btnBackFromMP').addEventListener('click', () => {
      UI.showScreen('screen-menu');
    });

    document.getElementById('btnBackFromStats').addEventListener('click', () => {
      UI.showScreen('screen-menu');
    });

    document.getElementById('btnCreateRoom').addEventListener('click', () => {
      const p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      const result = Multiplayer.createRoom({ id: p.id, name: p.name, avatar: p.avatar, hp: 100, wpm: 0, progress: 0 });
      UI.buildLobby(result.players, true, result.roomCode);
      UI.showScreen('screen-lobby');
      Effects.showToast('Room created! Share the code.', 'success');
    });

    document.getElementById('btnJoinRoom').addEventListener('click', () => {
      const code = document.getElementById('inputRoomCode').value.trim();
      if (code.length < 4) { Effects.showToast('Enter a valid room code!', 'error'); return; }
      const p = getProfile();
      p.id = p.id || Multiplayer.generatePlayerId();
      saveProfile(p);
      const result = Multiplayer.joinRoom(code, { id: p.id, name: p.name, avatar: p.avatar, hp: 100, wpm: 0, progress: 0 });
      UI.buildLobby(result.players, false, result.roomCode);
      UI.showScreen('screen-lobby');
      Effects.showToast(`Joined room ${result.roomCode}!`, 'success');
    });

    document.getElementById('btnCopyCode').addEventListener('click', () => {
      const code = document.getElementById('lobbyCode').textContent;
      navigator.clipboard.writeText(code).then(() => Effects.showToast('Room code copied!', 'success'));
    });

    document.getElementById('btnStartMatch').addEventListener('click', () => {
      startMultiplayerGame();
    });

    document.getElementById('btnLeaveLobby').addEventListener('click', () => {
      Multiplayer.leaveRoom();
      UI.showScreen('screen-menu');
    });

    document.getElementById('gameInput').addEventListener('input', (e) => {
      Game.handleInput(e);
      Audio.keyPress();
    });

    document.querySelectorAll('.skill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const skill = btn.dataset.skill;
        Game.activateSkill(skill);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '1') Game.activateSkill('overdrive');
      if (e.key === '2') Game.activateSkill('freeze');
      if (e.key === '3') Game.activateSkill('burn');
    });

    document.getElementById('btnPlayAgain').addEventListener('click', () => {
      const state = Game.getState();
      if (state.mode === 'multiplayer') startMultiplayerGame();
      else startSolo();
    });

    document.getElementById('btnBackToMenu').addEventListener('click', () => {
      const p = getProfile();
      UI.updateMenuDisplay(p);
      UI.showScreen('screen-menu');
    });

    document.getElementById('inputRoomCode').addEventListener('input', function() {
      this.value = this.value.toUpperCase();
    });
  }

  function init() {
    bootSequence();
    bindEvents();
    UI.showScreen('screen-boot');

    document.addEventListener('click', () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) { try { new AudioCtx().resume(); } catch(e) {} }
    }, { once: true });
  }

  return { init, getProfile, saveProfile };
})();

document.addEventListener('DOMContentLoaded', App.init);
