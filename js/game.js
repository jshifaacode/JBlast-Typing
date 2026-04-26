const Game = (() => {
  let state = {
    mode:'solo', wave:1, score:0,
    playerHp:200, maxPlayerHp:200,
    combo:0, maxCombo:0,
    totalChars:0, correctChars:0, wrongChars:0,
    startTime:null, wordStartTime:null,
    currentWord:'', displayWord:'', typedIndex:0,
    enemies:[], running:false, paused:false,
    gameTimer:0, timerInterval:null,
    skills:{overdrive:{active:false,cooldown:0},freeze:{active:false,cooldown:0},burn:{active:false,cooldown:0}},
    multiplayer:false, skin:'default', _firstWord:null,
    _bots:[], _botCompleted:false
  };

  const ENEMIES = [
    {id:'bot',   name:'ROGUE BOT',   avatar:'🤖', maxHp:80,  attackDmg:6,  attackDelay:10000},
    {id:'virus', name:'VIRUS.EXE',   avatar:'🦠', maxHp:100, attackDmg:8,  attackDelay:9000},
    {id:'boss',  name:'SYSTEM BOSS', avatar:'💀', maxHp:180, attackDmg:12, attackDelay:8000, isBoss:true},
    {id:'glitch',name:'GLITCH_GHOST',avatar:'👾', maxHp:90,  attackDmg:7,  attackDelay:9500},
    {id:'phantom',name:'PHANTOM.SYS',avatar:'🕷️', maxHp:120, attackDmg:10, attackDelay:8500}
  ];

  function init(mode, skin, firstWord) {
    state.mode=mode; state.skin=skin||'default';
    state.wave=1; state.score=0;
    state.playerHp=200; state.maxPlayerHp=200;
    state.combo=0; state.maxCombo=0;
    state.totalChars=0; state.correctChars=0; state.wrongChars=0;
    state.startTime=Date.now(); state.running=false;
    state.gameTimer=0; state.enemies=[];
    state._firstWord=firstWord||null;
    state._bots=[]; state._botCompleted=false;

    ['Overdrive','Freeze','Burn'].forEach(sk=>{
      const btn=document.getElementById('skill'+sk);
      if(btn){btn.disabled=true;btn.classList.remove('ready-glow');}
      const cd=document.getElementById('cd'+sk);
      if(cd) cd.style.transform='scaleX(0)';
    });

    const input=document.getElementById('gameInput');
    if(input){input.value='';}

    showCountdown(()=>{state.running=true;spawnWave();startTimers();renderHpBars();});
  }

  function showCountdown(cb) {
    const zone=document.getElementById('enemyZone');
    if(zone) zone.innerHTML='<div class="countdown-overlay" id="cdOverlay"></div>';
    const overlay=document.getElementById('cdOverlay');
    const nums=['3','2','1','GO!'];
    let i=0;
    const tick=()=>{
      if(!overlay){cb();return;}
      if(i>=nums.length){if(overlay.parentElement)overlay.parentElement.innerHTML='';cb();return;}
      overlay.innerHTML=`<div class="countdown-num bb" style="color:${i===3?'var(--g)':'var(--c)'};">${nums[i]}</div>`;
      i++;
      setTimeout(tick,i<=3?850:450);
    };
    tick();
  }

  function spawnWave() {
    const zone=document.getElementById('enemyZone');
    if(zone) zone.innerHTML='';
    state.enemies=[];
    const waveMap={1:[ENEMIES[0]],2:[ENEMIES[0]],3:[ENEMIES[1]],4:[ENEMIES[3]],5:[ENEMIES[4]],6:[ENEMIES[2]]};
    const config=waveMap[Math.min(state.wave,6)]||[ENEMIES[1]];
    config.forEach(tmpl=>{
      const scale=1+(state.wave-1)*0.07;
      const e={...tmpl,hp:Math.floor(tmpl.maxHp*scale),maxHp:Math.floor(tmpl.maxHp*scale),phase:1,frozen:false,burning:false,burnTick:null,attackTimer:null};
      state.enemies.push(e);
      renderEnemy(e);
      scheduleAttack(e);
    });
    const wd=document.getElementById('waveDisplay');
    if(wd) wd.textContent='W'+state.wave;

    if(state.mode==='solo') spawnBotOpponents();
    nextWord();
  }

  function spawnBotOpponents() {
    state._bots.forEach(clearInterval);
    state._bots=[];
    state._botCompleted=false;
    const botNames=[{n:'CYPHER_X',a:'🤖'},{n:'VOID_RUNNER',a:'👾'},{n:'GHOST_42',a:'💀'}];
    const bots=botNames.slice(0,Math.min(state.wave,2)).map((b,i)=>({
      id:'bot_'+i, name:b.n, avatar:b.a,
      speed: 0.4+state.wave*0.15+Math.random()*0.3
    }));
    const word=state.currentWord||'';
    const totalChars=word.replace(/ /g,'').length||1;
    bots.forEach(bot=>{
      let typed=0;
      const delay=Math.floor(1000/(bot.speed*4));
      const iv=setInterval(()=>{
        if(!state.running){clearInterval(iv);return;}
        if(typed>=totalChars){
          clearInterval(iv);
          if(!state._botCompleted){
            state._botCompleted=true;
            onBotWordComplete(bot);
          }
          return;
        }
        typed++;
      },delay+Math.random()*220);
      state._bots.push(iv);
    });
  }

  function onBotWordComplete(bot) {
    if(!state.running) return;
  
    const dmg = 18;
    state.playerHp = Math.max(0, state.playerHp - dmg);
    renderHpBars();
    Effects.damageFlash();
    Audio.playerHit();
    Effects.showToast(`${bot.avatar} ${bot.name} selesai duluan! -${dmg} HP`, 'error', 2000);
    if(state.playerHp <= 0) endGame(false);
  }

  function renderEnemy(e) {
    const zone=document.getElementById('enemyZone'); if(!zone) return;
    const card=document.createElement('div');
    card.className='enemy-card'; card.id='enemy-'+e.id;
    card.innerHTML=`<div class="enemy-avatar">${e.avatar}</div><div class="enemy-name bb">${e.name}</div><div class="enemy-phase" id="phase-${e.id}">PHASE ${e.phase}</div><div class="enemy-hp-track"><div class="enemy-hp-fill" id="hp-${e.id}" style="width:100%"></div></div>`;
    zone.appendChild(card);
  }

  function scheduleAttack(e) {
    if(!state.running) return;
    const delay=e.frozen?e.attackDelay*2.5:e.attackDelay;
    e.attackTimer=setTimeout(()=>{
      if(!state.running||e.hp<=0) return;
      doAttack(e); scheduleAttack(e);
    },delay*(.8+Math.random()*.4));
  }

  function doAttack(e) {
    if(!state.running) return;
    const dmg=state.skills.overdrive.active?Math.floor(e.attackDmg*.5):e.attackDmg;
    state.playerHp=Math.max(0,state.playerHp-dmg);
    Effects.damageFlash(); Audio.playerHit(); renderHpBars();
    const card=document.getElementById('enemy-'+e.id);
    if(card){const f=document.createElement('div');f.className='enemy-attack-flash';card.appendChild(f);setTimeout(()=>f.remove(),200);}
    if(state.multiplayer) Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(),state.playerHp);
    if(state.playerHp<=0) {
      if(state.multiplayer) endMp(false);
      else endGame(false);
    }
  }

  function nextWord() {
    state._botCompleted=false;
    state._bots.forEach(clearInterval); state._bots=[];

    if(state._firstWord){
      state.currentWord=state._firstWord; state.displayWord=state._firstWord; state._firstWord=null;
    } else {
      const isBoss=state.enemies.some(e=>e.isBoss);
      if(isBoss){
        const boss=state.enemies.find(e=>e.isBoss);
        if(boss){
          if(boss.phase===1){state.currentWord=Words.getBoss();state.displayWord=state.currentWord;}
          else if(boss.phase===2){state.currentWord=Words.getHard();state.displayWord=state.currentWord;}
          else{state.currentWord=Words.getHard();state.displayWord=state.currentWord;}
        }
      } else {
        state.currentWord=Words.getByWave(state.wave);
        state.displayWord=state.currentWord;
      }
    }
    state.typedIndex=0; state.wordStartTime=Date.now();
    renderWord();
    const inp=document.getElementById('gameInput');
    if(inp){inp.value='';if(!isMobile())inp.focus();}
    if(state.multiplayer) Multiplayer.startBotSimulation(state.currentWord);
    else spawnBotOpponents();
    updateMobileHL();
  }

  function renderWord() {
    const el=document.getElementById('targetWord'); if(!el) return;
    el.innerHTML=state.displayWord.split('').map((c,i)=>{
      if(c===' ') return`<span class="char" data-i="${i}"> </span>`;
      let cls='char pending';
      if(i<state.typedIndex) cls='char correct';
      else if(i===state.typedIndex) cls='char active';
      return`<span class="${cls}" data-i="${i}">${c}</span>`;
    }).join('');
  }

  function handleInput(e) {
    if(!state.running||state.paused) return;
    const input=e.target, typed=input.value, lastChar=typed[typed.length-1];
    if(!lastChar){state.typedIndex=0;renderWord();return;}
    const expected=state.currentWord[state.typedIndex];
    state.totalChars++;
    if(lastChar===expected){
      state.correctChars++; state.typedIndex++; Audio.keyCorrect();
      const ch=document.querySelector(`[data-i="${state.typedIndex-1}"]`);
      if(ch){ch.className='char correct';Effects.typeEffect(ch,state.skin);}
      if(state.typedIndex<state.displayWord.length){const nx=document.querySelector(`[data-i="${state.typedIndex}"]`);if(nx)nx.className='char active';}
      updateMobileHL();
      if(state.multiplayer){Multiplayer.sendProgress(state.typedIndex/state.currentWord.length,calcWpm());if(state.typedIndex%3===0)Multiplayer.sendTyping();}
      if(state.typedIndex>=state.currentWord.length) onWordDone();
    } else {
      state.wrongChars++; state.combo=0; updateCombo();
      state.playerHp=Math.max(0,state.playerHp-2); renderHpBars();
      Audio.keyError(); Effects.screenShake(3,120);
      input.classList.add('wrong-char'); setTimeout(()=>input.classList.remove('wrong-char'),200);
      const ch=document.querySelector(`[data-i="${state.typedIndex}"]`);
      if(ch){ch.className='char wrong';setTimeout(()=>{if(ch.className==='char wrong')ch.className='char active';},280);}
      setTimeout(()=>{input.value='';},50);
      if(state.playerHp<=0){endGame(false);return;}
    }
    updateStats();
  }

  function handleVirtualKey(key) {
    if(!state.running||state.paused) return;
    if(key==='BACK'){if(state.typedIndex>0){state.typedIndex--;renderWord();}return;}
    const k=key.toLowerCase()===' '?' ':key.toLowerCase();
    const expected=state.currentWord[state.typedIndex];
    state.totalChars++;
    if(k===expected){
      state.correctChars++; state.typedIndex++; Audio.keyCorrect();
      const ch=document.querySelector(`[data-i="${state.typedIndex-1}"]`);
      if(ch){ch.className='char correct';Effects.typeEffect(ch,state.skin);}
      if(state.typedIndex<state.displayWord.length){const nx=document.querySelector(`[data-i="${state.typedIndex}"]`);if(nx)nx.className='char active';}
      updateMobileHL();
      if(state.multiplayer){Multiplayer.sendProgress(state.typedIndex/state.currentWord.length,calcWpm());if(state.typedIndex%3===0)Multiplayer.sendTyping();}
      if(state.typedIndex>=state.currentWord.length) onWordDone();
    } else {
      state.wrongChars++; state.combo=0; updateCombo();
      state.playerHp=Math.max(0,state.playerHp-2); renderHpBars();
      Audio.keyError(); Effects.screenShake(3,100);
      if(state.playerHp<=0){endGame(false);return;}
    }
    updateStats();
  }

  function onWordDone() {
    state._bots.forEach(clearInterval); state._bots=[]; state._botCompleted=true;
    state.combo++; if(state.combo>state.maxCombo)state.maxCombo=state.combo;
    Audio.wordComplete(); Effects.comboEffect(state.combo); Audio.comboUp(state.combo); updateCombo();
    const mult=state.skills.overdrive.active?2:1;
    const comboDmg=Math.min(state.combo,10)*2;
    const alive=state.enemies.filter(e=>e.hp>0);
    if(alive.length>0){
      const target=alive[Math.floor(Math.random()*alive.length)];
      dmgEnemy(target,Math.floor((22+comboDmg)*mult));
    }
    state.score+=(10+comboDmg)*mult;

    
    const baseHeal = 5;
    const comboHealBonus = Math.min(state.combo - 1, 5) * 2;
    const healAmt = baseHeal + comboHealBonus;
    const prevHp = state.playerHp;
    state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmt);
    const actualHeal = state.playerHp - prevHp;
    if(actualHeal > 0) {
      renderHpBars();
      const hpEl = document.getElementById('hpBars');
      if(hpEl) {
        const num = document.createElement('div');
        num.className = 'enemy-damage-number';
        num.textContent = '+' + actualHeal + ' HP';
        num.style.cssText = 'color:#00ff88;text-shadow:0 0 10px #00ff88;';
        hpEl.style.position = 'relative';
        hpEl.appendChild(num);
        setTimeout(() => num.remove(), 800);
      }
    }

    if(state.combo>=3&&state.combo%3===0) unlockSkill();

    if(state.multiplayer){
      // Sync HP heal ke server dulu
      Multiplayer.updatePlayerHp(Multiplayer.getPlayerId(), state.playerHp);
      Multiplayer.sendProgress(1, calcWpm());
      Multiplayer.sendWordComplete && Multiplayer.sendWordComplete(calcWpm());
      // Damage ke semua lawan — setara & adil
      const myId = Multiplayer.getPlayerId();
      const opponents = Multiplayer.getPlayers().filter(p => p.id !== myId);
      if(opponents.length > 0){
        opponents.forEach(opp => {
          const dmgToOpp = 15 + comboDmg;
          Multiplayer.updatePlayerHp(opp.id, Math.max(0, (opp.hp || 100) - dmgToOpp));
          Multiplayer.sendDamage(opp.id, dmgToOpp);
        });
      }
    }

    if(state.enemies.every(e=>e.hp<=0)) onWaveClear();
    else setTimeout(nextWord, 200);
  }

  function dmgEnemy(e, amount) {
    if(e.hp<=0) return;
    e.hp=Math.max(0,e.hp-amount);
    const pct=(e.hp/e.maxHp)*100;
    const hpEl=document.getElementById('hp-'+e.id);
    if(hpEl){hpEl.style.width=pct+'%';if(pct<30)hpEl.style.background='var(--r)';else if(pct<60)hpEl.style.background='var(--o)';}
    const card=document.getElementById('enemy-'+e.id);
    if(card) Effects.showDamageNumber(card,amount);
    Audio.hit();
    if(e.isBoss){
      if(e.hp<e.maxHp*.66&&e.phase===1){e.phase=2;Effects.showToast('⚠️ BOSS PHASE 2 — WORD GLITCH!','warning');}
      if(e.hp<e.maxHp*.33&&e.phase===2){e.phase=3;Effects.showToast('🚨 BOSS PHASE 3 — CHARS HIDDEN!','warning');}
      const phEl=document.getElementById('phase-'+e.id);
      if(phEl) phEl.textContent='PHASE '+e.phase;
    }
    if(e.hp<=0){
      if(card){Effects.killEffect(card);card.style.opacity='0';card.style.transform='scale(0)';card.style.transition='all .3s';setTimeout(()=>card.remove(),300);}
      clearTimeout(e.attackTimer); if(e.burnTick) clearInterval(e.burnTick);
    }
  }

  function onWaveClear() {
    state.wave++; state.score+=100*state.wave;
    Effects.showToast(`✅ WAVE ${state.wave-1} CLEAR! +${100*(state.wave-1)} SCORE`,'success');
    Audio.victory();
    state.enemies.forEach(e=>{clearTimeout(e.attackTimer);if(e.burnTick)clearInterval(e.burnTick);});
    if(state.wave>6) endGame(true);
    else setTimeout(()=>{Effects.showToast(`⚡ WAVE ${state.wave} INCOMING!`,'warning',1200);setTimeout(spawnWave,1500);},400);
  }

  function unlockSkill() {
    for(const sk of ['overdrive','freeze','burn']){
      if(!state.skills[sk].active&&state.skills[sk].cooldown===0){
        const btn=document.getElementById('skill'+sk.charAt(0).toUpperCase()+sk.slice(1));
        if(btn&&btn.disabled){btn.disabled=false;btn.classList.add('ready-glow');Effects.showToast('⚡ SKILL READY: '+sk.toUpperCase(),'info');break;}
      }
    }
  }

  function activateSkill(name) {
    const skill=state.skills[name]; if(!skill||skill.cooldown>0||!state.running) return;
    const cap=name.charAt(0).toUpperCase()+name.slice(1);
    const btn=document.getElementById('skill'+cap);
    if(btn&&btn.disabled) return;
    if(name==='overdrive'){
      skill.active=true; document.body.classList.add('overdrive');
      Audio.overdrive(); Effects.showToast('⚡ OVERDRIVE — DMG x2!','warning');
      setTimeout(()=>{skill.active=false;document.body.classList.remove('overdrive');setCooldown('overdrive',20000);},5000);
    }
    if(name==='freeze'){
      state.enemies.forEach(e=>{e.frozen=true;const c=document.getElementById('enemy-'+e.id);if(c)c.classList.add('frozen');setTimeout(()=>{e.frozen=false;if(c)c.classList.remove('frozen');},4000);});
      Audio.freeze(); Effects.showToast('❄️ ENEMIES FROZEN!','info'); setCooldown('freeze',18000);
    }
    if(name==='burn'){
      state.enemies.forEach(e=>{
        if(e.hp>0){
          e.burning=true; const c=document.getElementById('enemy-'+e.id); if(c) c.classList.add('burning');
          let ticks=0;
          e.burnTick=setInterval(()=>{
            if(!state.running||e.hp<=0||ticks>=8){clearInterval(e.burnTick);e.burning=false;if(c)c.classList.remove('burning');return;}
            dmgEnemy(e,8); ticks++;
          },500);
        }
      });
      Audio.burn(); Effects.showToast('🔥 BURN — DOT DAMAGE!','warning'); setCooldown('burn',15000);
    }
    if(btn) btn.disabled=true;
  }

  function setCooldown(name, ms) {
    state.skills[name].cooldown=ms;
    const cap=name.charAt(0).toUpperCase()+name.slice(1);
    const cdEl=document.getElementById('cd'+cap), btn=document.getElementById('skill'+cap);
    if(!cdEl||!btn) return;
    btn.disabled=true; btn.classList.remove('ready-glow');
    const start=Date.now();
    const iv=setInterval(()=>{
      const el=Date.now()-start, pct=el/ms;
      cdEl.style.transform=`scaleX(${pct})`; state.skills[name].cooldown=ms-el;
      if(el>=ms){clearInterval(iv);state.skills[name].cooldown=0;cdEl.style.transform='scaleX(0)';btn.disabled=false;btn.classList.add('ready-glow');Effects.showToast(`⚡ ${name.toUpperCase()} READY!`,'info');}
    },50);
  }

  function startTimers() {
    clearInterval(state.timerInterval);
    state.timerInterval=setInterval(()=>{
      if(!state.running||state.paused) return;
      state.gameTimer++;
      const m=Math.floor(state.gameTimer/60).toString().padStart(2,'0');
      const s=(state.gameTimer%60).toString().padStart(2,'0');
      const el=document.getElementById('gameTimer'); if(el) el.textContent=m+':'+s;
    },1000);
  }

  function calcWpm() { const el=(Date.now()-state.startTime)/60000; return el<.01?0:Math.floor((state.correctChars/5)/el); }
  function calcAcc() { return state.totalChars===0?100:Math.floor((state.correctChars/state.totalChars)*100); }
  function updateStats() { const w=calcWpm(),a=calcAcc(); const we=document.getElementById('liveWpm'),ae=document.getElementById('liveAcc'); if(we)we.textContent=w+' WPM'; if(ae)ae.textContent=a+'%'; }
  function updateCombo() {
    const el=document.getElementById('comboDisplay'), tx=document.getElementById('comboText');
    if(!el||!tx) return;
    if(state.combo>=2){el.style.display='inline';tx.style.display='inline';tx.textContent='COMBO x'+state.combo;tx.style.animation='none';void tx.offsetHeight;tx.style.animation='comboPulse .3s ease-out';}
    else{el.style.display='none';tx.style.display='none';}
  }
  function renderHpBars() {
    const c=document.getElementById('hpBars'); if(!c) return;
    const pPct=Math.max(0,(state.playerHp/state.maxPlayerHp)*100);
    let html=`<div class="hp-bar-item"><div class="hp-bar-label"><span>YOU</span><span>${Math.ceil(state.playerHp)} / ${state.maxPlayerHp}</span></div><div class="hp-bar-track"><div class="hp-bar-fill player" style="width:${pPct}%"></div></div></div>`;
    state.enemies.forEach(e=>{
      const pct=Math.max(0,(e.hp/e.maxHp)*100);
      html+=`<div class="hp-bar-item"><div class="hp-bar-label"><span>${e.avatar} ${e.name}</span><span>${Math.ceil(e.hp)} / ${e.maxHp}</span></div><div class="hp-bar-track"><div class="hp-bar-fill enemy" style="width:${pct}%"></div></div></div>`;
    });
    c.innerHTML=html;
  }
  function updateMobileHL() {
    const next=state.currentWord[state.typedIndex]; if(!next) return;
    document.querySelectorAll('.key-btn').forEach(b=>{b.classList.remove('highlight');if(b.dataset.key===next.toUpperCase()||b.dataset.key===next)b.classList.add('highlight');});
  }

  function setupMultiplayer() {
    state.multiplayer=true;
    const sb=document.getElementById('mpSidebar'); if(sb) sb.style.display='block';
    Multiplayer.on('player_progress',()=>updateMpSidebar());
    Multiplayer.on('player_typing',({playerId,name})=>{
      const ind=document.getElementById('typingIndicators'); if(!ind) return;
      let dot=document.getElementById('ind-'+playerId);
      if(!dot){dot=document.createElement('div');dot.id='ind-'+playerId;dot.className='typing-indicator';dot.textContent=(name||'?')+' is typing...';ind.appendChild(dot);}
      clearTimeout(dot._t); dot._t=setTimeout(()=>dot.remove(),1500);
    });
    Multiplayer.on('player_word_complete',({playerId:wpid})=>{
      if(!state.running) return;
      const myId=Multiplayer.getPlayerId();
      if(wpid===myId) return;
      const p=Multiplayer.getPlayers().find(pl=>pl.id===wpid);
      if(p){
       
        Effects.showToast(`${p.avatar||'⚡'} ${p.name} selesai duluan! Mereka +HP, kamu -HP`, 'error', 2000);
        Effects.damageFlash();
      }
    });
    Multiplayer.on('hp_update',({playerId:hpid,hp})=>{
      updateMpSidebar();
      if(!state.running) return;
      const myId=Multiplayer.getPlayerId();
      if(hpid===myId) return;
      const allPlayers=Multiplayer.getPlayers();
      const opponents=allPlayers.filter(p=>p.id!==myId);
      const allDead=opponents.length>0&&opponents.every(p=>(p.hp||0)<=0);
      if(allDead) endMp(true);
    });
    Multiplayer.on('damage_dealt',({to,amount})=>{
      const myId=Multiplayer.getPlayerId();
      if(to===myId){
        state.playerHp=Math.max(0,state.playerHp-amount);
        renderHpBars(); Effects.damageFlash(); Audio.playerHit();
        if(state.playerHp<=0) endMp(false);
      }
    });
    updateMpSidebar();
  }

  function updateMpSidebar() {
    const list=document.getElementById('mpPlayerList'); if(!list) return;
    const myId=Multiplayer.getPlayerId();
    list.innerHTML=Multiplayer.getPlayers().map(p=>{
      const hpColor=(p.hp||0)>60?'var(--g)':(p.hp||0)>30?'var(--o)':'var(--r)';
      return`<div class="mp-player-row"><div class="mp-player-info"><span class="mp-player-avatar">${p.avatar||'⚡'}</span><span class="mp-player-name">${p.name}${p.id===myId?' (YOU)':''}</span></div><div class="mp-player-hp-wrap"><div class="mp-player-hp-fill" style="width:${p.hp||100}%;background:${hpColor}"></div></div><span class="mp-player-wpm">${p.wpm||0} WPM</span><span class="mp-player-pct">${Math.floor((p.progress||0)*100)}%</span></div>`;
    }).join('');
  }

  function endMp(iWon) {
    if(!state.running) return;
    state.running=false; clearInterval(state.timerInterval);
    state.enemies.forEach(e=>{clearTimeout(e.attackTimer);if(e.burnTick)clearInterval(e.burnTick);});
    state._bots.forEach(clearInterval);
    Multiplayer.stopBots();
    const wpm=calcWpm(), acc=calcAcc();
    const allPlayers=Multiplayer.getPlayers();
    const myId=Multiplayer.getPlayerId();
    let winnerId=null;
    if(iWon){winnerId=myId;}
    else{const alive=allPlayers.filter(p=>p.id!==myId&&(p.hp||0)>0);if(alive.length>0)winnerId=alive.reduce((a,b)=>(a.hp||0)>(b.hp||0)?a:b).id;}
    if(iWon) Audio.victory(); else Audio.defeat();
    setTimeout(()=>UI.showResult({victory:iWon,wpm,accuracy:acc,maxCombo:state.maxCombo,score:state.score,mpWinner:winnerId,mpPlayers:allPlayers}),800);
  }

  function endGame(victory) {
    if(!state.running) return;
    state.running=false; clearInterval(state.timerInterval);
    state.enemies.forEach(e=>{clearTimeout(e.attackTimer);if(e.burnTick)clearInterval(e.burnTick);});
    state._bots.forEach(clearInterval);
    if(state.multiplayer) Multiplayer.stopBots();
    if(victory) Audio.victory(); else Audio.defeat();
    setTimeout(()=>UI.showResult({victory,wpm:calcWpm(),accuracy:calcAcc(),maxCombo:state.maxCombo,score:state.score}),800);
  }

  function getState(){ return{...state}; }
  return{init,handleInput,handleVirtualKey,activateSkill,getState,endGame,endMp,setupMultiplayer};
})();
