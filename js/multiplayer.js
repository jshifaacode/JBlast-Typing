const Multiplayer = (() => {
  let ws = null;
  let currentRoom = null;
  let playerId = null;
  let isHost = false;
  let players = {};
  let callbacks = {};

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

  function emit(event, data) {
    if (callbacks[event]) callbacks[event](data);
  }

  function simulateMultiplayer(roomCode, playerData, hosted) {
    currentRoom = roomCode;
    playerId = playerData.id;
    isHost = hosted;
    players = {};
    players[playerId] = { ...playerData, hp: 100, wpm: 0, progress: 0 };

    const botNames = ['CYPHER_X', 'VOID_RUNNER', 'GHOST_42', 'NEON_STRIKE'];
    const botAvatars = ['🤖', '👾', '💀', '🦾'];
    const botCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < botCount; i++) {
      const botId = 'bot_' + i;
      players[botId] = {
        id: botId,
        name: botNames[i],
        avatar: botAvatars[i],
        hp: 100, wpm: 0, progress: 0,
        isBot: true,
        speed: 0.5 + Math.random() * 1.5
      };
    }

    emit('room_joined', { roomCode, players: Object.values(players), isHost });

    setTimeout(() => {
      emit('player_joined', players[playerId]);
    }, 200);

    return { roomCode, players: Object.values(players) };
  }

  function createRoom(playerData) {
    const code = generateRoomCode();
    playerData.id = playerData.id || generatePlayerId();
    return simulateMultiplayer(code, playerData, true);
  }

  function joinRoom(code, playerData) {
    playerData.id = playerData.id || generatePlayerId();
    return simulateMultiplayer(code.toUpperCase(), playerData, false);
  }

  function startGame() {
    if (!isHost) return;
    emit('game_start', { word: Words.getByWave(1), players: Object.values(players) });
  }

  let botIntervals = [];

  function startBotSimulation(word) {
    botIntervals.forEach(clearInterval);
    botIntervals = [];

    Object.values(players).forEach(p => {
      if (!p.isBot) return;
      let charIdx = 0;
      const totalChars = word.replace(/ /g, '').length;
      const baseDelay = Math.floor(1000 / (p.speed * 4));

      const interval = setInterval(() => {
        if (charIdx >= totalChars) {
          clearInterval(interval);
          emit('player_word_complete', { playerId: p.id, wpm: Math.floor(p.speed * 60) });
          return;
        }

        charIdx++;
        p.progress = charIdx / totalChars;
        p.wpm = Math.floor(p.speed * 50 + Math.random() * 20);
        emit('player_progress', { playerId: p.id, progress: p.progress, wpm: p.wpm });
      }, baseDelay + Math.random() * 200);

      botIntervals.push(interval);
    });
  }

  function stopBots() {
    botIntervals.forEach(clearInterval);
    botIntervals = [];
  }

  function sendProgress(progress, wpm) {
    if (!currentRoom) return;
    if (players[playerId]) {
      players[playerId].progress = progress;
      players[playerId].wpm = wpm;
    }
    emit('player_progress', { playerId, progress, wpm });
  }

  function sendTyping() {
    emit('player_typing', { playerId, name: players[playerId]?.name });
  }

  function sendDamage(targetId, amount) {
    emit('damage_dealt', { from: playerId, to: targetId, amount });
  }

  function updatePlayerHp(pid, hp) {
    if (players[pid]) players[pid].hp = hp;
    emit('hp_update', { playerId: pid, hp });
  }

  function leaveRoom() {
    stopBots();
    currentRoom = null;
    players = {};
    emit('left_room', {});
  }

  function getPlayers() { return Object.values(players); }
  function getPlayer() { return players[playerId]; }
  function getCurrentRoom() { return currentRoom; }
  function getIsHost() { return isHost; }
  function getPlayerId() { return playerId; }

  return {
    on, createRoom, joinRoom, startGame, startBotSimulation, stopBots,
    sendProgress, sendTyping, sendDamage, updatePlayerHp, leaveRoom,
    getPlayers, getPlayer, getCurrentRoom, getIsHost, getPlayerId,
    generatePlayerId
  };
})();
