const Effects = (() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [], stars = [], t = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = Array.from({length:70}, () => ({
      x: Math.random()*canvas.width, y: Math.random()*canvas.height,
      r: Math.random()*1.3+.3, spd: Math.random()*.2+.04, b: Math.random()*Math.PI*2
    }));
  }
  window.addEventListener('resize', resize);
  resize();

  function spawnParticle(x, y, color='#00f5ff') {
    for(let i=0;i<8;i++) {
      const a=(Math.PI*2/8)*i+Math.random()*.5, s=Math.random()*3+1;
      particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:Math.random()*.04+.02,size:Math.random()*4+2,color});
    }
  }
  function spawnBurst(x, y, color, count=20) {
    for(let i=0;i<count;i++) {
      const a=Math.random()*Math.PI*2, s=Math.random()*6+2;
      particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:Math.random()*.02+.015,size:Math.random()*6+2,color});
    }
  }

  (function loop() {
    t += .003;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const g = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    g.addColorStop(0, `rgba(0,245,255,${.01+Math.sin(t)*.006})`);
    g.addColorStop(.5, `rgba(191,0,255,${.007+Math.cos(t*.8)*.004})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const s of stars) {
      s.b+=.015; s.y-=s.spd;
      if(s.y<0){s.y=canvas.height; s.x=Math.random()*canvas.width;}
      const alpha=.12+Math.abs(Math.sin(s.b))*.4;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(160,200,255,${alpha})`; ctx.fill();
    }
    particles = particles.filter(p=>p.life>0);
    for(const p of particles) {
      p.x+=p.vx; p.y+=p.vy; p.vy+=.1; p.life-=p.decay;
      ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
      ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
    }
    ctx.globalAlpha=1;
    requestAnimationFrame(loop);
  })();

  function screenShake(intensity=8, dur=300) {
    const app=document.getElementById('app'), start=Date.now();
    (function shake() {
      const el=Date.now()-start;
      if(el>=dur){app.style.transform='';return;}
      const d=1-el/dur;
      app.style.transform=`translate(${(Math.random()-.5)*intensity*2*d}px,${(Math.random()-.5)*intensity*d}px)`;
      requestAnimationFrame(shake);
    })();
  }
  function damageFlash() {
    const o=document.getElementById('damage-overlay');
    o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash');
    screenShake(6,200);
  }
  function showDamageNumber(el, amount, color='#ffe000') {
    const num=document.createElement('div');
    num.className='enemy-damage-number'; num.textContent=`-${amount}`;
    num.style.color=color; num.style.textShadow=`0 0 8px ${color}`;
    el.appendChild(num); setTimeout(()=>num.remove(),850);
    try{const r=el.getBoundingClientRect();spawnParticle(r.left+r.width/2,r.top+r.height/2,color);}catch(_){}
  }
  function killEffect(el) {
    try{const r=el.getBoundingClientRect();spawnBurst(r.left+r.width/2,r.top+r.height/2,'#ff2244',30);spawnBurst(r.left+r.width/2,r.top+r.height/2,'#ffe000',20);}catch(_){}
    screenShake(12,300);
  }
  function comboEffect(combo) {
    const cols=['#00f5ff','#00ff88','#ffe000','#ff0080','#9d00ff'];
    const color=cols[Math.min(combo-1,cols.length-1)];
    const el=document.querySelector('.target-word');
    if(el){try{const r=el.getBoundingClientRect();spawnParticle(r.left+r.width/2,r.top+r.height/2,color);}catch(_){}}
  }
  function typeEffect(el, skin) {
    if(!el) return;
    try{
      const r=el.getBoundingClientRect();
      const cols={fire:'#ff6600',lightning:'#ffe000',glitch:'#9d00ff',ice:'#00ccff',default:'#00f5ff'};
      particles.push({x:r.left+r.width/2,y:r.top+r.height/2,vx:(Math.random()-.5)*2,vy:-Math.random()*2-1,life:.8,decay:.06,size:Math.random()*3+1,color:cols[skin]||cols.default});
    }catch(_){}
  }
  function showToast(msg, type='info', dur=2500) {
    const c=document.getElementById('toast-container');
    const t=document.createElement('div');
    t.className=`toast ${type}`; t.textContent=msg; c.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},dur);
  }
  return {spawnParticle,spawnBurst,screenShake,damageFlash,showDamageNumber,killEffect,comboEffect,typeEffect,showToast};
})();
