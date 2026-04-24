const Audio = (() => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let muted = false;

  function resume() {
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playTone(freq, type, duration, gain = 0.3) {
    resume();
    if (muted) return;
    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  }

  function playNoise(duration, gain = 0.1) {
    resume();
    if (muted) return;
    try {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start();
    } catch(e) {}
  }

  return {
    keyPress() { playTone(800 + Math.random() * 200, 'square', 0.04, 0.08); },
    keyCorrect() { playTone(1200, 'sine', 0.06, 0.12); },
    keyError() {
      playTone(200, 'sawtooth', 0.12, 0.15);
      playNoise(0.08, 0.08);
    },
    wordComplete() {
      playTone(800, 'sine', 0.05, 0.2);
      setTimeout(() => playTone(1200, 'sine', 0.05, 0.15), 60);
      setTimeout(() => playTone(1600, 'sine', 0.05, 0.1), 120);
    },
    hit() {
      playTone(400, 'sawtooth', 0.08, 0.25);
      playNoise(0.06, 0.06);
    },
    playerHit() {
      playTone(150, 'sawtooth', 0.2, 0.3);
      playNoise(0.15, 0.12);
    },
    comboUp() { playTone(600 + combo * 50, 'sine', 0.05, 0.2); },
    overdrive() {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => playTone(400 + i * 200, 'sawtooth', 0.1, 0.15), i * 40);
      }
    },
    freeze() {
      playTone(2000, 'sine', 0.3, 0.2);
      playTone(1800, 'sine', 0.3, 0.2);
    },
    burn() {
      playNoise(0.2, 0.15);
      playTone(200, 'sawtooth', 0.2, 0.2);
    },
    victory() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.25), i * 100));
    },
    defeat() {
      const notes = [400, 300, 200, 150];
      notes.forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.3), i * 150));
    },
    setMuted(v) { muted = v; },
    isMuted() { return muted; }
  };
})();
