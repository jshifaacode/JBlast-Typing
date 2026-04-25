/**
 * multiplayer.js — Real-time multiplayer via Firebase Realtime Database
 *
 * HOW TO SET UP (FREE):
 * 1. Buka https://console.firebase.google.com
 * 2. Buat project baru (misal: "keystorm-game")
 * 3. Klik "Realtime Database" → Create Database → pilih region → "Start in test mode"
 * 4. Salin URL database kamu (bentuknya: https://xxx-default-rtdb.firebaseio.com)
 * 5. Ganti nilai FIREBASE_URL di bawah ini dengan URL kamu
 * 6. Upload semua file ke Netlify seperti biasa
 *
 * Rules Firebase (Database Rules) — paste ini di Firebase Console > Rules:
 * {
 *   "rules": {
 *     "rooms": {
 *       "$roomId": {
 *         ".read": true,
 *         ".write": true
 *       }
 *     }
 *   }
 * }
 */

const FIREBASE_URL = 'https://YOUR-PROJECT-default-rtdb.firebaseio.com';
// ↑↑↑ GANTI DENGAN URL FIREBASE KAMU ↑↑↑

const Multiplayer = (() => {
  let currentRoom = null;
  let playerId = null;
  let isHost = false;
  let players = {};
  let callbacks = {};
  let listeners = []; // untuk cleanup
  let botIntervals = [];
  let presenceRef = null;

  // ─── Helpers ───────────────────────────────────────────────

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function generatePlayerId() {
    return Math.random().toString(36).substr(2, 9);
  }

  function on(event, cb) { callbacks[event] = cb; }
  function emit(event, data) { if (callbacks[event]) callbacks[event](data); }

  // ─── Firebase REST helpers (no SDK needed) ─────────────────

  async function fbGet(path) {
    try {
      const res = await fetch(`${FIREBASE_URL}/${path}.json`);
      return await res.json();
    } catch (e) { return null; }
  }

  async function fbSet(path, data) {
    try {
      await fetch(`${FIREBASE_URL}/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) { console.warn('fbSet error', e); }
  }

  async function fbUpdate(path, data) {
    try {
      await fetch(`${FIREBASE_URL}/${path}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) { console.warn('fbUpdate error', e); }
  }

  async function fbDelete(path) {
    try {
      await fetch(`${FIREBASE_URL}/${path}.json`, { method: 'DELETE' });
    } catch (e) {}
  }

  // ─── Server-Sent Events (SSE) untuk real-time listen ───────
  // Firebase REST API mendukung SSE tanpa SDK

  function fbListen(path, callback) {
    const url = `${FIREBASE_URL}/${path}.json`;
    const es = new EventSource(url);
    es.addEventListener('put', (e) => {
      try {
        const d = JSON.parse(e.data);
        callback(d.data, d.path);
      } catch (err) {}
    });
    es.addEventListener('patch', (e) => {
      try {
        const d = JSON.parse(e.data);
        callback(d.data, d.path);
      } catch (err) {}
    });
    es.onerror = () => {};
    listeners.push(es);
    return es;
  }

  function closeListeners() {
    listeners.forEach(es => { try { es.close(); } catch (e) {} });
    listeners = [];
  }

  // ─── Room management ───────────────────────────────────────

  async function createRoom(playerData) {
    const code = generateRoomCode();
    playerData.id = playerData.id || generatePlayerId();
    playerId = playerData.id;
    isHost = true;
    currentRoom = code;

    const roomData = {
      code,
      host: playerId,
      status: 'lobby',         // lobby | playing | done
      createdAt: Date.now(),
      players: {
        [playerId]: {
          id: playerId,
          name: playerData.name,
          avatar: playerData.avatar,
          hp: 100,
          wpm: 0,
          progress: 0,
          ready: true,
          isBot: false,
          online: true
        }
      },
      currentWord: '',
      events: {}
    };

    await fbSet(`rooms/${code}`, roomData);
    players = roomData.players;

    // Mulai listen perubahan room
    _listenRoom(code);

    // Presence: hapus player kalau tab ditutup
    _setupPresence(code, playerId);

    return { roomCode: code, players: Object.values(players) };
  }

  async function joinRoom(code, playerData) {
    code = code.toUpperCase();
    const roomData = await fbGet(`rooms/${code}`);

    if (!roomData) {
      Effects.showToast('ROOM TIDAK DITEMUKAN!', 'error');
      return null;
    }
    if (roomData.status === 'playing') {
      Effects.showToast('GAME SUDAH BERJALAN!', 'error');
      return null;
    }

    playerData.id = playerData.id || generatePlayerId();
    playerId = playerData.id;
    isHost = false;
    currentRoom = code;

    const playerEntry = {
      id: playerId,
      name: playerData.name,
      avatar: playerData.avatar,
      hp: 100,
      wpm: 0,
      progress: 0,
      ready: true,
      isBot: false,
      online: true
    };

    await fbSet(`rooms/${code}/players/${playerId}`, playerEntry);

    // Ambil semua players setelah join
    const allPlayers = await fbGet(`rooms/${code}/players`);
    players = allPlayers || {};

    _listenRoom(code);
    _setupPresence(code, playerId);

    return { roomCode: code, players: Object.values(players) };
  }

  function _setupPresence(code, pid) {
    // Tandai offline kalau tab ditutup
    window.addEventListener('beforeunload', () => {
      // Gunakan sendBeacon agar request selesai walau tab ditutup
      const url = `${FIREBASE_URL}/rooms/${code}/players/${pid}/online.json`;
      navigator.sendBeacon(url, JSON.stringify(false));
    });
  }

  function _listenRoom(code) {
    // Listen perubahan players
    fbListen(`rooms/${code}/players`, (data, path) => {
      if (!data) return;

      // data bisa full object (put) atau partial (patch)
      if (path === '/' || path === '') {
        // Full replace
        if (typeof data === 'object' && data !== null) {
          players = data;
          emit('players_update', { players: Object.values(players) });
          _updateLobbyUI();
        }
      } else {
        // Partial update — path bisa "/PLAYERID/field" atau "/PLAYERID"
        const parts = path.replace(/^\//, '').split('/');
        const pid2 = parts[0];
        if (pid2) {
          if (!players[pid2]) players[pid2] = {};
          if (parts.length === 1) {
            // data adalah object player
            if (typeof data === 'object' && data !== null) {
              players[pid2] = { ...players[pid2], ...data };
            } else if (data === null) {
              delete players[pid2];
            }
          } else {
            // data adalah value field
            const field = parts.slice(1).join('/');
            _setNestedField(players[pid2], field, data);
          }
          emit('players_update', { players: Object.values(players) });
          emit('player_progress', { playerId: pid2, progress: players[pid2]?.progress || 0, wpm: players[pid2]?.wpm || 0 });
          emit('hp_update', { playerId: pid2, hp: players[pid2]?.hp || 0 });
          _updateLobbyUI();
        }
      }
    });

    // Listen game events (word, status)
    fbListen(`rooms/${code}`, (data, path) => {
      if (!data) return;

      if (path === '/' || path === '') {
        // Full room data
        if (data.status === 'playing' && !isHost) {
          // Non-host: game dimulai oleh host
          if (data.currentWord) {
            emit('game_start', { word: data.currentWord, players: Object.values(players) });
          }
        }
        if (data.currentWord) {
          emit('new_word', { word: data.currentWord });
        }
      } else if (path === '/status') {
        if (data === 'playing' && !isHost) {
          fbGet(`rooms/${code}/currentWord`).then(w => {
            if (w) emit('game_start', { word: w, players: Object.values(players) });
          });
        }
      } else if (path === '/currentWord') {
        if (data) emit('new_word', { word: data });
      }
    });

    // Listen events (typing indicators, kills, etc.)
    fbListen(`rooms/${code}/events`, (data, path) => {
      if (!data || path === '/' || path === '') return;
      // path = "/eventId"
      if (typeof data === 'object' && data !== null && data.type) {
        _handleEvent(data);
      }
    });
  }

  function _setNestedField(obj, path, value) {
    const parts = path.split('/');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function _handleEvent(ev) {
    if (ev.from === playerId) return; // skip event sendiri
    switch (ev.type) {
      case 'typing':
        emit('player_typing', { playerId: ev.from, name: ev.name });
        break;
      case 'word_complete':
        emit('player_word_complete', { playerId: ev.from, wpm: ev.wpm });
        break;
      case 'damage':
        emit('damage_dealt', { from: ev.from, to: ev.to, amount: ev.amount });
        break;
    }
  }

  function _updateLobbyUI() {
    // Update lobby display kalau masih di lobby
    const lobbyEl = document.getElementById('lobbyPlayers');
    if (!lobbyEl) return;
    const grid = lobbyEl;
    const myId = playerId;
    grid.innerHTML = Object.values(players).map(p =>
      `<div class="lpc ready">
        <div class="lpc-avatar">${p.avatar || '⚡'}</div>
        <div class="lpc-name">${p.name}${p.id === myId ? ' (YOU)' : ''}</div>
        <div class="lpc-status" style="color:var(--green)">READY ✓</div>
      </div>`
    ).join('');

    const statusEl = document.getElementById('lobbyStatus');
    if (statusEl) statusEl.textContent = Object.keys(players).length + ' PILOT(S) IN LOBBY';
  }

  // ─── Game flow ─────────────────────────────────────────────

  async function startGame() {
    if (!isHost || !currentRoom) return;
    const word = typeof Words !== 'undefined' ? Words.getByWave(1) : 'hack';
    await fbUpdate(`rooms/${currentRoom}`, {
      status: 'playing',
      currentWord: word,
      startedAt: Date.now()
    });
    emit('game_start', { word, players: Object.values(players) });
  }

  async function sendProgress(progress, wpm) {
    if (!currentRoom || !playerId) return;
    if (players[playerId]) { players[playerId].progress = progress; players[playerId].wpm = wpm; }
    await fbUpdate(`rooms/${currentRoom}/players/${playerId}`, { progress, wpm });
    emit('player_progress', { playerId, progress, wpm });
  }

  async function sendTyping() {
    if (!currentRoom || !playerId) return;
    const evId = Date.now().toString(36);
    await fbSet(`rooms/${currentRoom}/events/${evId}`, {
      type: 'typing',
      from: playerId,
      name: players[playerId]?.name || '?',
      ts: Date.now()
    });
    emit('player_typing', { playerId, name: players[playerId]?.name });
  }

  async function sendDamage(targetId, amount) {
    if (!currentRoom || !playerId) return;
    const evId = Date.now().toString(36) + '_dmg';
    await fbSet(`rooms/${currentRoom}/events/${evId}`, {
      type: 'damage',
      from: playerId,
      to: targetId,
      amount,
      ts: Date.now()
    });
  }

  async function updatePlayerHp(pid, hp) {
    if (!currentRoom) return;
    if (players[pid]) players[pid].hp = hp;
    await fbUpdate(`rooms/${currentRoom}/players/${pid}`, { hp });
    emit('hp_update', { playerId: pid, hp });
  }

  async function sendWordComplete(wpm) {
    if (!currentRoom || !playerId) return;
    const evId = Date.now().toString(36) + '_wc';
    await fbSet(`rooms/${currentRoom}/events/${evId}`, {
      type: 'word_complete',
      from: playerId,
      wpm,
      ts: Date.now()
    });
    emit('player_word_complete', { playerId, wpm });
  }

  async function leaveRoom() {
    stopBots();
    if (currentRoom && playerId) {
      await fbDelete(`rooms/${currentRoom}/players/${playerId}`);
      // Kalau host pergi, hapus room
      if (isHost) {
        await fbDelete(`rooms/${currentRoom}`);
      }
    }
    closeListeners();
    currentRoom = null;
    players = {};
    isHost = false;
    emit('left_room', {});
  }

  // ─── Bot simulation (fallback / solo practice) ─────────────

  function startBotSimulation(word) {
    botIntervals.forEach(clearInterval);
    botIntervals = [];
    Object.values(players).forEach(p => {
      if (!p.isBot) return;
      let charIdx = 0;
      const total = word.replace(/ /g, '').length;
      const baseDelay = Math.floor(1000 / (p.speed * 4));
      const iv = setInterval(() => {
        if (charIdx >= total) {
          clearInterval(iv);
          emit('player_word_complete', { playerId: p.id, wpm: Math.floor(p.speed * 60) });
          return;
        }
        charIdx++;
        p.progress = charIdx / total;
        p.wpm = Math.floor(p.speed * 50 + Math.random() * 20);
        emit('player_progress', { playerId: p.id, progress: p.progress, wpm: p.wpm });
      }, baseDelay + Math.random() * 200);
      botIntervals.push(iv);
    });
  }

  function stopBots() {
    botIntervals.forEach(clearInterval);
    botIntervals = [];
  }

  // ─── Getters ───────────────────────────────────────────────

  function getPlayers() { return Object.values(players); }
  function getPlayer() { return players[playerId]; }
  function getCurrentRoom() { return currentRoom; }
  function getIsHost() { return isHost; }
  function getPlayerId() { return playerId; }

  return {
    on,
    generatePlayerId,
    createRoom,
    joinRoom,
    startGame,
    startBotSimulation,
    stopBots,
    sendProgress,
    sendTyping,
    sendDamage,
    sendWordComplete,
    updatePlayerHp,
    leaveRoom,
    getPlayers,
    getPlayer,
    getCurrentRoom,
    getIsHost,
    getPlayerId,
  };
})();
