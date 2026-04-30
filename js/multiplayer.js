const FIREBASE_URL = 'https://jblast-typing-default-rtdb.firebaseio.com';

const Multiplayer = (() => {
  let room = null, pid = null, isHost = false, players = {}, cbs = {};
  let _ls = [], _bots = [], _poll = null, _lastSnap = '', _lastStatus = '';

  const PLAYER_MAX_HP = 200;

  const genCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 5; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
  const genId = () => Math.random().toString(36).substr(2, 9);
  const on = (ev, cb) => cbs[ev] = cb;
  const emit = (ev, d) => cbs[ev] && cbs[ev](d);

  async function get(path) { try { const r = await fetch(`${FIREBASE_URL}/${path}.json`, {cache: 'no-store'}); return await r.json(); } catch (_) { return null; } }
  async function set(path, d) { try { await fetch(`${FIREBASE_URL}/${path}.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d)}); } catch (_) {} }
  async function upd(path, d) { try { await fetch(`${FIREBASE_URL}/${path}.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d)}); } catch (_) {} }
  async function del(path) { try { await fetch(`${FIREBASE_URL}/${path}.json`, {method: 'DELETE'}); } catch (_) {} }

  function listen(path, cb) {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource(`${FIREBASE_URL}/${path}.json`);
      es.addEventListener('put', e => { try { const d = JSON.parse(e.data); cb(d.data, d.path || '/'); } catch (_) {} });
      es.addEventListener('patch', e => { try { const d = JSON.parse(e.data); cb(d.data, d.path || '/'); } catch (_) {} });
      es.onerror = () => {};
      _ls.push(es);
    } catch (_) {}
  }

  function stopListeners() { _ls.forEach(es => { try { es.close(); } catch (_) {} }); _ls = []; if (_poll) { clearInterval(_poll); _poll = null; } }

  function startPoll(code) {
    _poll = setInterval(async () => {
      const r = await get(`rooms/${code}`);
      if (!r) return;
      const snap = JSON.stringify(r.players || {});
      if (snap !== _lastSnap) {
        _lastSnap = snap;
        players = r.players || {};
        emit('players_update', {players: Object.values(players)});
        _updateLobby();
      }
      if (!isHost && r.status === 'playing' && _lastStatus !== 'playing') {
        _lastStatus = 'playing';
        if (r.currentWord) emit('game_start', {word: r.currentWord, players: Object.values(players)});
      }
      if (r.status) _lastStatus = r.status;
    }, 1200);
  }

  function _entry(p) {
    return {id: p.id, name: p.name, avatar: p.avatar, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, wpm: 0, progress: 0, ready: true, isBot: false, online: true};
  }

  async function createRoom(p) {
    p.id = p.id || genId();
    pid = p.id;
    isHost = true;
    const code = genCode();
    room = code;
    const data = {code, host: pid, status: 'lobby', createdAt: Date.now(), players: {[pid]: _entry(p)}, currentWord: '', events: {}};
    await set(`rooms/${code}`, data);
    players = {[pid]: _entry(p)};
    _listen(code);
    startPoll(code);
    window.addEventListener('beforeunload', () => navigator.sendBeacon(`${FIREBASE_URL}/rooms/${code}/players/${pid}/online.json`, JSON.stringify(false)));
    return {roomCode: code, players: Object.values(players)};
  }

  async function joinRoom(code, p) {
    code = code.toUpperCase();
    const r = await get(`rooms/${code}`);
    if (!r) { Effects.showToast('ROOM TIDAK DITEMUKAN!', 'error'); return null; }
    if (r.status === 'playing') { Effects.showToast('GAME SUDAH BERJALAN!', 'error'); return null; }
    p.id = p.id || genId();
    pid = p.id;
    isHost = false;
    room = code;
    await set(`rooms/${code}/players/${pid}`, _entry(p));
    const all = await get(`rooms/${code}/players`);
    players = all || {};
    _listen(code);
    startPoll(code);
    window.addEventListener('beforeunload', () => navigator.sendBeacon(`${FIREBASE_URL}/rooms/${code}/players/${pid}/online.json`, JSON.stringify(false)));
    return {roomCode: code, players: Object.values(players)};
  }

  function _listen(code) {
    listen(`rooms/${code}/players`, (data, path) => {
      if (!data && path === '/') return;
      if (path === '/' || path === '') {
        if (data && typeof data === 'object') { players = data; emit('players_update', {players: Object.values(players)}); _updateLobby(); }
      } else {
        const parts = path.replace(/^\//, '').split('/');
        const p2 = parts[0];
        if (!p2) return;
        if (data === null) delete players[p2];
        else if (typeof data === 'object') players[p2] = {...(players[p2] || {}), ...data};
        else if (parts.length > 1) { if (!players[p2]) players[p2] = {}; players[p2][parts[1]] = data; }
        emit('players_update', {players: Object.values(players)});
        emit('player_progress', {playerId: p2, progress: players[p2]?.progress || 0, wpm: players[p2]?.wpm || 0});
        emit('hp_update', {playerId: p2, hp: players[p2]?.hp ?? PLAYER_MAX_HP});
        _updateLobby();
      }
    });

    listen(`rooms/${code}/status`, data => {
      if (data === 'playing' && !isHost) {
        get(`rooms/${code}/currentWord`).then(w => { if (w) emit('game_start', {word: w, players: Object.values(players)}); });
      }
    });

    listen(`rooms/${code}/events`, (data, path) => {
      if (!data || path === '/' || path === '') return;
      if (typeof data === 'object' && data.type && data.from !== pid) _handleEv(data);
    });
  }

  function _handleEv(ev) {
    if (ev.type === 'typing') emit('player_typing', {playerId: ev.from, name: ev.name});
    if (ev.type === 'word_complete') emit('player_word_complete', {playerId: ev.from, wpm: ev.wpm});
    if (ev.type === 'damage') emit('damage_dealt', {from: ev.from, to: ev.to, amount: ev.amount});
  }

  function _updateLobby() {
    const grid = document.getElementById('lobbyPlayers');
    if (!grid) return;
    grid.innerHTML = Object.values(players).map(p =>
      `<div class="lpc ready"><div class="lpc-avatar">${p.avatar || '⚡'}</div><div class="lpc-name bb">${p.name}${p.id === pid ? ' (YOU)' : ''}</div><div class="lpc-status" style="color:var(--g)">READY ✓</div></div>`
    ).join('');
    const st = document.getElementById('lobbyStatus');
    if (st) st.textContent = Object.keys(players).length + ' PILOT(S) IN LOBBY';
  }

  async function startGame() {
    if (!isHost || !room) return;
    const word = Words.getByWave(1);
    await upd(`rooms/${room}`, {status: 'playing', currentWord: word, startedAt: Date.now()});
    emit('game_start', {word, players: Object.values(players)});
  }

  async function sendProgress(progress, wpm) {
    if (!room || !pid) return;
    if (players[pid]) { players[pid].progress = progress; players[pid].wpm = wpm; }
    emit('player_progress', {playerId: pid, progress, wpm});
    await upd(`rooms/${room}/players/${pid}`, {progress, wpm});
  }

  async function sendTyping() {
    if (!room || !pid) return;
    emit('player_typing', {playerId: pid, name: players[pid]?.name});
    const id = Date.now().toString(36);
    await set(`rooms/${room}/events/${id}`, {type: 'typing', from: pid, name: players[pid]?.name || '?', ts: Date.now()});
  }

  async function sendDamage(targetId, amount) {
    if (!room || !pid) return;
    const id = Date.now().toString(36) + '_d';
    await set(`rooms/${room}/events/${id}`, {type: 'damage', from: pid, to: targetId, amount, ts: Date.now()});
  }

  async function updatePlayerHp(p, hp) {
    if (!room) return;
    const safeHp = Math.max(0, Math.min(PLAYER_MAX_HP, hp));
    if (players[p]) players[p].hp = safeHp;
    emit('hp_update', {playerId: p, hp: safeHp});
    await upd(`rooms/${room}/players/${p}`, {hp: safeHp});
  }

  async function leaveRoom() {
    stopBots();
    stopListeners();
    if (room && pid) { await del(`rooms/${room}/players/${pid}`); if (isHost) await del(`rooms/${room}`); }
    room = null;
    players = {};
    isHost = false;
    emit('left_room', {});
  }

  function startBotSimulation(word) {
    _bots.forEach(clearInterval);
    _bots = [];
    Object.values(players).forEach(p => {
      if (!p.isBot) return;
      let idx = 0;
      const total = word.replace(/ /g, '').length;
      const baseDelay = Math.floor(1000 / (p.speed * 4));
      const iv = setInterval(() => {
        if (idx >= total) { clearInterval(iv); emit('player_word_complete', {playerId: p.id, wpm: Math.floor(p.speed * 60)}); return; }
        idx++;
        p.progress = idx / total;
        p.wpm = Math.floor(p.speed * 50 + Math.random() * 20);
        emit('player_progress', {playerId: p.id, progress: p.progress, wpm: p.wpm});
      }, baseDelay + Math.random() * 200);
      _bots.push(iv);
    });
  }

  function stopBots() { _bots.forEach(clearInterval); _bots = []; }

  function getPlayers() { return Object.values(players); }
  function getPlayer() { return players[pid]; }
  function getCurrentRoom() { return room; }
  function getIsHost() { return isHost; }
  function getPlayerId() { return pid; }
  function generatePlayerId() { return genId(); }

  return {on, generatePlayerId, createRoom, joinRoom, startGame, startBotSimulation, stopBots, sendProgress, sendTyping, sendDamage, updatePlayerHp, leaveRoom, getPlayers, getPlayer, getCurrentRoom, getIsHost, getPlayerId};
})();
