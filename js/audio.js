const Audio = (() => {
  let _ctx = null;
  let muted = false;
  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }
  function resume() { try { if(ctx().state==='suspended') ctx().resume(); } catch(e){} }
  function tone(freq, type, dur, gain=.3) {
    resume(); if(muted) return;
    try {
      const o=ctx().createOscillator(), g=ctx().createGain();
      o.connect(g); g.connect(ctx().destination);
      o.type=type; o.frequency.setValueAtTime(freq,ctx().currentTime);
      g.gain.setValueAtTime(gain,ctx().currentTime);
      g.gain.exponentialRampToValueAtTime(.001,ctx().currentTime+dur);
      o.start(); o.stop(ctx().currentTime+dur);
    } catch(e) {}
  }
  function noise(dur, gain=.1) {
    resume(); if(muted) return;
    try {
      const n=ctx().sampleRate*dur, buf=ctx().createBuffer(1,n,ctx().sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
      const s=ctx().createBufferSource(), g=ctx().createGain();
      g.gain.setValueAtTime(gain,ctx().currentTime);
      g.gain.exponentialRampToValueAtTime(.001,ctx().currentTime+dur);
      s.buffer=buf; s.connect(g); g.connect(ctx().destination); s.start();
    } catch(e) {}
  }
  return {
    keyPress(){ tone(800+Math.random()*200,'square',.04,.07); },
    keyCorrect(){ tone(1200,'sine',.06,.1); },
    keyError(){ tone(200,'sawtooth',.12,.14); noise(.08,.07); },
    wordComplete(){ tone(800,'sine',.05,.18); setTimeout(()=>tone(1200,'sine',.05,.14),60); setTimeout(()=>tone(1600,'sine',.05,.1),120); },
    hit(){ tone(400,'sawtooth',.08,.2); noise(.06,.05); },
    playerHit(){ tone(150,'sawtooth',.2,.28); noise(.15,.1); },
    comboUp(c){ tone(600+c*40,'sine',.05,.18); },
    overdrive(){ for(let i=0;i<5;i++) setTimeout(()=>tone(400+i*200,'sawtooth',.1,.14),i*40); },
    freeze(){ tone(2000,'sine',.3,.18); tone(1800,'sine',.3,.18); },
    burn(){ noise(.2,.14); tone(200,'sawtooth',.2,.18); },
    victory(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',.2,.22),i*100)); },
    defeat(){ [400,300,200,150].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',.25,.28),i*150)); },
    setMuted(v){ muted=v; }, isMuted(){ return muted; }
  };
})();
