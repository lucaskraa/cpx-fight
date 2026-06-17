(() => {
  'use strict';

  const DATA = window.CPX_FIGHT_DATA;
  const FIGHTERS = DATA.fighters;
  const GAME = DATA.game;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);

  const dom = {
    screens: [...document.querySelectorAll('.screen')],
    loadingScreen: $('loadingScreen'), loadingFill: $('loadingFill'), loadingStatus: $('loadingStatus'),
    menuScreen: $('menuScreen'), playButton: $('playButton'), controlsButton: $('controlsButton'),
    selectScreen: $('selectScreen'), p1Preview: $('p1Preview'), p2Preview: $('p2Preview'), p1Roster: $('p1Roster'), p2Roster: $('p2Roster'), p1Ready: $('p1Ready'), p2Ready: $('p2Ready'), backToMenuButton: $('backToMenuButton'),
    fightScreen: $('fightScreen'), canvas: $('gameCanvas'), announcerText: $('announcerText'), comboText: $('comboText'), pauseButton: $('pauseButton'),
    p1HudPortrait: $('p1HudPortrait'), p2HudPortrait: $('p2HudPortrait'), p1HudName: $('p1HudName'), p2HudName: $('p2HudName'), p1RoundWins: $('p1RoundWins'), p2RoundWins: $('p2RoundWins'), p1HealthFill: $('p1HealthFill'), p2HealthFill: $('p2HealthFill'), p1MeterFill: $('p1MeterFill'), p2MeterFill: $('p2MeterFill'), roundLabel: $('roundLabel'), timerLabel: $('timerLabel'),
    resultScreen: $('resultScreen'), resultTitle: $('resultTitle'), resultPortrait: $('resultPortrait'), resultSubtitle: $('resultSubtitle'), rematchButton: $('rematchButton'), changeFightersButton: $('changeFightersButton'),
    controlsDialog: $('controlsDialog'), closeControlsButton: $('closeControlsButton')
  };

  const images = new Map();
  const keys = new Set();
  const pressed = new Set();
  const app = {
    screen: 'loadingScreen',
    select: { p1: 0, p2: 1, ready1: false, ready2: false },
    chosen: { p1: null, p2: null },
    engine: null
  };

  class SoundEngine {
    constructor() { this.ctx = null; this.master = 0.26; }
    ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    tone(freq = 200, duration = .1, type = 'square', volume = .12, slide = null) {
      this.ensure();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), now + duration);
      gain.gain.setValueAtTime(volume * this.master, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(this.ctx.destination); osc.start(now); osc.stop(now + duration);
    }
    noise(duration = .12, volume = .12) {
      this.ensure(); const len = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = this.ctx.createBufferSource(); const gain = this.ctx.createGain();
      source.buffer = buffer; gain.gain.value = volume * this.master; source.connect(gain).connect(this.ctx.destination); source.start();
    }
    hit(power = 1) { this.noise(.09 + power * .04, .15 + power * .08); this.tone(120, .09, 'sawtooth', .18, 58); }
    kick() { this.hit(1.2); this.tone(80, .16, 'triangle', .2, 35); }
    special() { this.tone(90, .5, 'sawtooth', .16, 900); this.noise(.3, .18); }
    select() { this.tone(420, .07, 'square', .1, 650); }
    confirm() { this.tone(520, .12, 'triangle', .14, 880); }
  }
  const sound = new SoundEngine();

  function speak(text, priority = true) {
    if (!('speechSynthesis' in window)) return;
    if (priority) speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'pt-BR'; utter.rate = .79; utter.pitch = .55; utter.volume = .95;
    const voices = speechSynthesis.getVoices();
    utter.voice = voices.find(v => /pt-BR/i.test(v.lang) && /(male|ricardo|antonio|google)/i.test(v.name)) || voices.find(v => /pt-BR/i.test(v.lang)) || null;
    speechSynthesis.speak(utter);
  }

  function showScreen(id) {
    dom.screens.forEach(s => s.classList.toggle('screen--active', s.id === id));
    app.screen = id;
  }

  async function preload() {
    const paths = [...new Set(FIGHTERS.flatMap(f => [f.portrait, f.sprite]))];
    let done = 0;
    await Promise.all(paths.map(path => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { images.set(path, img); done++; dom.loadingFill.style.width = `${done / paths.length * 100}%`; dom.loadingStatus.textContent = `Carregando ${done}/${paths.length}`; resolve(); };
      img.onerror = () => { done++; dom.loadingFill.style.width = `${done / paths.length * 100}%`; resolve(); };
      img.src = path;
    })));
    await new Promise(r => setTimeout(r, 450));
    showScreen('menuScreen');
  }

  function fighterCardHTML(f) {
    return `<img src="${f.portrait}" alt="${f.name}"><div class="fighter-preview__info"><h3>${f.name}</h3><strong>${f.nickname} · ${f.style}</strong><p>${f.bio}</p></div>`;
  }

  function renderSelection() {
    const s = app.select;
    const f1 = FIGHTERS[s.p1], f2 = FIGHTERS[s.p2];
    dom.p1Preview.innerHTML = fighterCardHTML(f1);
    dom.p2Preview.innerHTML = fighterCardHTML(f2);
    dom.p1Roster.innerHTML = FIGHTERS.map((f, i) => `<button class="roster-card ${i === s.p1 ? 'roster-card--active' : ''}" data-player="1" data-index="${i}"><img src="${f.portrait}" alt="${f.name}"><span>${f.name}</span></button>`).join('');
    dom.p2Roster.innerHTML = FIGHTERS.map((f, i) => `<button class="roster-card ${i === s.p2 ? 'roster-card--active' : ''}" data-player="2" data-index="${i}"><img src="${f.portrait}" alt="${f.name}"><span>${f.name}</span></button>`).join('');
    dom.p1Ready.textContent = s.ready1 ? 'JOGADOR 1 PRONTO' : 'A/D PARA ESCOLHER · F PARA CONFIRMAR';
    dom.p2Ready.textContent = s.ready2 ? 'JOGADOR 2 PRONTO' : '←/→ PARA ESCOLHER · J PARA CONFIRMAR';
    dom.p1Ready.classList.toggle('ready-badge--ready', s.ready1); dom.p2Ready.classList.toggle('ready-badge--ready', s.ready2);
  }

  function moveSelection(player, dir) {
    const key = player === 1 ? 'p1' : 'p2'; const ready = player === 1 ? 'ready1' : 'ready2';
    if (app.select[ready]) return;
    app.select[key] = (app.select[key] + dir + FIGHTERS.length) % FIGHTERS.length;
    sound.select(); renderSelection();
  }

  function confirmSelection(player) {
    const ready = player === 1 ? 'ready1' : 'ready2';
    if (app.select[ready]) { app.select[ready] = false; sound.select(); renderSelection(); return; }
    app.select[ready] = true; sound.confirm(); renderSelection();
    if (app.select.ready1 && app.select.ready2) {
      app.chosen.p1 = FIGHTERS[app.select.p1]; app.chosen.p2 = FIGHTERS[app.select.p2];
      setTimeout(startMatch, 650);
    }
  }

  function announce(text, voice = text) {
    dom.announcerText.textContent = text;
    dom.announcerText.classList.remove('announcer-text--show'); void dom.announcerText.offsetWidth; dom.announcerText.classList.add('announcer-text--show');
    if (voice) speak(voice);
  }

  function showCombo(text, side = 1) {
    dom.comboText.textContent = text; dom.comboText.style.left = side === 1 ? '4%' : 'auto'; dom.comboText.style.right = side === 2 ? '4%' : 'auto';
    dom.comboText.classList.remove('combo-text--show'); void dom.comboText.offsetWidth; dom.comboText.classList.add('combo-text--show');
  }

  class Particle {
    constructor(x, y, options = {}) {
      this.x = x; this.y = y; this.vx = options.vx ?? rand(-180, 180); this.vy = options.vy ?? rand(-260, -50); this.life = options.life ?? .45; this.max = this.life; this.size = options.size ?? rand(5, 14); this.color = options.color ?? '#fff'; this.gravity = options.gravity ?? 800; this.shape = options.shape ?? 'circle';
    }
    update(dt) { this.life -= dt; this.vy += this.gravity * dt; this.x += this.vx * dt; this.y += this.vy * dt; }
    draw(ctx) { const a = clamp(this.life / this.max, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = this.color; if (this.shape === 'square') ctx.fillRect(this.x, this.y, this.size, this.size); else { ctx.beginPath(); ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  }

  class Projectile {
    constructor(owner, kind, options) {
      Object.assign(this, { owner, kind, alive: true, age: 0 }, options);
    }
    update(dt, engine) {
      this.age += dt; this.x += this.vx * dt; this.y += (this.vy || 0) * dt;
      if (this.age > this.life || this.x < -100 || this.x > GAME.arenaWidth + 100) this.alive = false;
      const enemy = engine.players[this.owner === 1 ? 2 : 1];
      if (!this.alive || enemy.invulnerable > 0) return;
      const dx = Math.abs(this.x - enemy.x); const dy = Math.abs(this.y - (enemy.y - enemy.height * .52));
      if (dx < this.radius + enemy.width * .34 && dy < this.radius + enemy.height * .42) {
        this.alive = false;
        engine.applyHit(engine.players[this.owner], enemy, this.damage, this.knockback, this.hitstun, this.kind, this.meterGain || 8);
        engine.burst(this.x, this.y, this.color, 14, 1.2);
      }
    }
    draw(ctx) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.age * 8 * Math.sign(this.vx));
      if (this.kind.includes('ball')) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#20242e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#242834'; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * this.radius * .47, Math.sin(a) * this.radius * .47, this.radius * .16, 0, Math.PI * 2); ctx.fill(); }
      } else if (this.kind === 'chicken') {
        ctx.font = `${this.radius * 2.2}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🐔', 0, 0);
      }
      ctx.restore();
    }
  }

  class FighterActor {
    constructor(playerId, data, x, facing) {
      this.playerId = playerId; this.data = data; this.sprite = images.get(data.sprite); this.x = x; this.y = GAME.floorY; this.vx = 0; this.vy = 0; this.facing = facing; this.width = data.body.width; this.height = data.body.height;
      this.health = data.health; this.maxHealth = data.health; this.meter = 0; this.state = 'idle'; this.stateTime = 0; this.attack = null; this.hitDone = false; this.hitSteps = new Set(); this.grounded = true; this.blocking = false; this.hitstun = 0; this.invulnerable = 0; this.flash = 0; this.combo = 0; this.comboTimer = 0;
    }
    reset(x, facing) {
      this.x=x; this.y=GAME.floorY; this.vx=0; this.vy=0; this.facing=facing; this.health=this.maxHealth; this.meter=0; this.state='idle'; this.stateTime=0; this.attack=null; this.hitDone=false; this.hitSteps.clear(); this.grounded=true; this.blocking=false; this.hitstun=0; this.invulnerable=0; this.flash=0; this.combo=0; this.comboTimer=0;
    }
    getControls() {
      return this.playerId === 1 ? { left:'KeyA', right:'KeyD', jump:'KeyW', block:'KeyS', punch:'KeyF', kick:'KeyG', special:'KeyH' } : { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', block:'ArrowDown', punch:'KeyJ', kick:'KeyK', special:'KeyL' };
    }
    canAct() { return this.hitstun <= 0 && !this.attack; }
    beginAttack(type, engine) {
      if (!this.canAct() || !this.grounded) return;
      const move = this.data.moves[type]; if (!move) return;
      if (type === 'special') { if (this.meter < move.meterCost) { sound.tone(120,.08,'square',.08); return; } this.meter = 0; sound.special(); engine.shake = Math.max(engine.shake, 8); }
      this.attack = { type, move, elapsed: 0, duration: move.startup + move.active + move.recovery, spawned: false };
      this.state = type; this.stateTime = 0; this.hitDone = false; this.hitSteps.clear(); this.vx *= .15;
    }
    update(dt, engine) {
      this.stateTime += dt; this.flash = Math.max(0, this.flash - dt); this.invulnerable = Math.max(0, this.invulnerable - dt); this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0;
      const controls = this.getControls();
      if (this.hitstun > 0) {
        this.hitstun -= dt; this.state = 'hurt'; this.x += this.vx * dt; this.vx *= Math.pow(.05, dt);
      } else if (this.attack) {
        this.updateAttack(dt, engine);
      } else {
        this.blocking = keys.has(controls.block) && this.grounded;
        if (this.blocking) { this.state='block'; this.vx=0; }
        else {
          const axis = (keys.has(controls.right)?1:0) - (keys.has(controls.left)?1:0);
          this.vx = axis * this.data.speed; if (axis) { this.state='walk'; this.facing = axis > 0 ? 1 : -1; } else { this.vx=0; this.state=this.grounded?'idle':'jump'; }
          if (pressed.has(controls.jump) && this.grounded) { this.vy=-this.data.jumpPower; this.grounded=false; this.state='jump'; sound.tone(180,.08,'triangle',.08,300); }
          if (pressed.has(controls.punch)) this.beginAttack('punch', engine);
          else if (pressed.has(controls.kick)) this.beginAttack('kick', engine);
          else if (pressed.has(controls.special)) this.beginAttack('special', engine);
        }
      }
      if (!this.grounded) { this.vy += GAME.gravity * dt; this.y += this.vy * dt; if (this.y >= GAME.floorY) { this.y=GAME.floorY; this.vy=0; this.grounded=true; if (!this.attack && this.hitstun<=0) this.state='idle'; } }
      if (this.hitstun<=0 && !this.attack) this.x += this.vx * dt;
      this.x = clamp(this.x, 65, GAME.arenaWidth - 65);
    }
    updateAttack(dt, engine) {
      const a = this.attack; a.elapsed += dt; this.stateTime += dt; const move = a.move;
      const activeStart = move.startup, activeEnd = move.startup + move.active;
      if (a.type === 'special' && move.kind === 'combo' && a.elapsed >= activeStart && a.elapsed <= activeEnd) {
        const enemy = engine.players[this.playerId===1?2:1]; this.facing = enemy.x >= this.x ? 1 : -1; this.x += this.facing * 270 * dt;
        const steps=[.05,.22,.39,.58,.79]; steps.forEach((s,i)=>{ if (a.elapsed-activeStart>=s && !this.hitSteps.has(i)) { this.hitSteps.add(i); if (engine.inRange(this, enemy, move.range)) engine.applyHit(this, enemy, move.damage/move.hits, i===4?move.knockback:85, i===4?move.hitstun:.12, 'combo', 0, i===4); } });
      } else if (a.type === 'special' && move.kind === 'multiBall') {
        const interval=.14; const count=Math.min(move.hits, Math.floor(Math.max(0,a.elapsed-activeStart)/interval)+1);
        for(let i=0;i<count;i++) if(!this.hitSteps.has(i)){ this.hitSteps.add(i); engine.spawnBall(this, move.damage/move.hits, 720+rand(-30,50), .75, `special-ball-${i}`, 28, move.knockback/move.hits, .16); }
      } else if (a.type === 'special' && move.kind === 'explosion' && a.elapsed>=activeStart && !this.hitDone) {
        this.hitDone=true; engine.explosion(this.x+this.facing*75,this.y-105,move.range,this.data.accent); const enemy=engine.players[this.playerId===1?2:1]; if(engine.inRange(this,enemy,move.range)) engine.applyHit(this,enemy,move.damage,move.knockback,move.hitstun,'explosion',0,true);
      } else if (a.type === 'special' && move.kind === 'tractor' && a.elapsed>=activeStart && a.elapsed<=activeEnd) {
        const enemy=engine.players[this.playerId===1?2:1]; this.facing=enemy.x>=this.x?1:-1; this.x += this.facing*720*dt; if(!this.hitDone && engine.inRange(this,enemy,170)){this.hitDone=true;engine.applyHit(this,enemy,move.damage,move.knockback,move.hitstun,'tractor',0,true);engine.shake=22;}
      } else if (a.elapsed>=activeStart && a.elapsed<=activeEnd && !this.hitDone) {
        if (move.kind === 'shortBall') { this.hitDone=true; engine.spawnBall(this,move.damage,550,.34,'ball-short',22,move.knockback,move.hitstun); }
        else if (move.kind === 'chicken') { this.hitDone=true; engine.spawnChicken(this,move); }
        else { const enemy=engine.players[this.playerId===1?2:1]; if(engine.inRange(this,enemy,move.range)){ this.hitDone=true; let damage=move.damage; if(move.missChance&&Math.random()<move.missChance){engine.floatText(this.x+this.facing*100,this.y-160,'ERROU','#ddd');} else { if(move.critChance&&Math.random()<move.critChance){damage*=move.critMultiplier;engine.floatText(enemy.x,enemy.y-190,'CRÍTICO!','#ffe66d');} engine.applyHit(this,enemy,damage,move.knockback,move.hitstun,a.type,move.meter,a.type==='kick'); } } }
      }
      if (a.elapsed >= a.duration) { this.attack=null; this.state='idle'; this.stateTime=0; this.hitDone=false; this.hitSteps.clear(); }
    }
    frameIndex() {
      const map=this.data.frameMap; let frames=map[this.state]||map.idle;
      if(this.state==='hurt'||this.state==='block'||this.state==='jump') frames=map.idle;
      if(this.attack){ const p=clamp(this.attack.elapsed/this.attack.duration,0,.999); return frames[Math.floor(p*frames.length)] ?? frames[0]; }
      const speed=this.state==='walk'?8:3; return frames[Math.floor(this.stateTime*speed)%frames.length];
    }
    draw(ctx) {
      const frame=this.frameIndex(), cell=300, sx=(frame%4)*cell, sy=Math.floor(frame/4)*cell;
      const renderH = this.attack?.type==='special' && this.data.id==='james' ? 360 : 310;
      const renderW = renderH;
      ctx.save(); ctx.translate(this.x,this.y); ctx.scale(this.facing,1);
      if(this.blocking){ctx.globalAlpha=.78;ctx.fillStyle='rgba(90,170,255,.25)';ctx.beginPath();ctx.arc(this.facing*22,-115,82,0,Math.PI*2);ctx.fill();}
      if(this.flash>0){ctx.filter='brightness(2.3) saturate(.3)';}
      ctx.drawImage(this.sprite,sx,sy,cell,cell,-renderW/2,-renderH,renderW,renderH);
      ctx.restore();
      ctx.save();ctx.globalAlpha=.28;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(this.x,this.y+2,this.width*.55,18,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  class GameEngine {
    constructor(canvas, f1, f2) {
      this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.fighterData=[null,f1,f2]; this.players=[null,new FighterActor(1,f1,300,1),new FighterActor(2,f2,980,-1)];
      this.round=1; this.roundWins=[0,0,0]; this.timer=GAME.roundSeconds; this.running=false; this.paused=false; this.roundActive=false; this.last=0; this.projectiles=[]; this.particles=[]; this.floaters=[]; this.shake=0; this.suddenDeath=false; this.backgroundTime=0;
      this.loop=this.loop.bind(this);
    }
    start() { this.running=true; this.startRound(); requestAnimationFrame(this.loop); }
    startRound() {
      this.players[1].reset(300,1);this.players[2].reset(980,-1);this.timer=GAME.roundSeconds;this.projectiles=[];this.particles=[];this.floaters=[];this.suddenDeath=false;this.roundActive=false;updateHud(this);
      announce(`ROUND ${this.round}`,`Round ${this.round}`);setTimeout(()=>{announce('LUTEM!','Lutem!');this.roundActive=true;},1150);
    }
    loop(t) { if(!this.running)return; const dt=Math.min(.033,(t-this.last)/1000||0);this.last=t;if(!this.paused)this.update(dt);this.draw();pressed.clear();requestAnimationFrame(this.loop); }
    update(dt) {
      this.backgroundTime+=dt;if(!this.roundActive)return;
      this.timer-=dt;if(this.timer<=0){if(Math.abs(this.players[1].health-this.players[2].health)<1&&!this.suddenDeath){this.suddenDeath=true;this.timer=15;announce('MORTE SÚBITA','Morte súbita');}else this.finishByTime();return;}
      this.players[1].update(dt,this);this.players[2].update(dt,this);this.resolveBodies();
      this.projectiles.forEach(p=>p.update(dt,this));this.projectiles=this.projectiles.filter(p=>p.alive);
      this.particles.forEach(p=>p.update(dt));this.particles=this.particles.filter(p=>p.life>0);
      this.floaters.forEach(f=>{f.life-=dt;f.y-=55*dt;});this.floaters=this.floaters.filter(f=>f.life>0);
      this.shake=Math.max(0,this.shake-28*dt);updateHud(this);
    }
    resolveBodies() { const a=this.players[1],b=this.players[2];const min=(a.width+b.width)*.34;const dx=b.x-a.x;if(Math.abs(dx)<min){const push=(min-Math.abs(dx))/2;const sign=dx>=0?1:-1;a.x-=push*sign;b.x+=push*sign;}a.x=clamp(a.x,65,1215);b.x=clamp(b.x,65,1215);if(a.x>b.x){a.facing=-1;b.facing=1;}else{a.facing=1;b.facing=-1;} }
    inRange(a,b,range){return Math.abs(a.x-b.x)<=range && Math.abs((a.y-a.height*.45)-(b.y-b.height*.45))<150;}
    applyHit(attacker, defender, damage, knockback, hitstun, kind, meterGain=8, heavy=false) {
      if(!this.roundActive||defender.invulnerable>0)return;
      let blocked=defender.blocking&&defender.facing===-Math.sign(attacker.x-defender.x);if(blocked){damage*=.28;knockback*=.35;hitstun*=.42;this.floatText(defender.x,defender.y-170,'BLOQUEIO','#7ec8ff');sound.tone(260,.08,'square',.12,160);}else{sound.hit(heavy?1.4:1);defender.flash=.11;}
      defender.health=clamp(defender.health-damage,0,defender.maxHealth);defender.meter=clamp(defender.meter+damage*.12,0,100);attacker.meter=clamp(attacker.meter+(meterGain||damage*.06),0,100);
      defender.vx=attacker.facing*knockback;defender.hitstun=hitstun;defender.attack=null;defender.state='hurt';defender.combo=0;attacker.combo++;attacker.comboTimer=.8;
      this.burst(defender.x,defender.y-105,blocked?'#72b7ff':attacker.data.accent,heavy?24:14,heavy?1.7:1);this.shake=Math.max(this.shake,heavy?18:8);
      if(attacker.combo>=2)showCombo(`${attacker.combo} GOLPES`,attacker.playerId);
      if(this.suddenDeath){this.endRound(attacker.playerId,'Primeiro golpe na morte súbita');return;}
      if(defender.health<=0)this.endRound(attacker.playerId,'Nocaute');
    }
    spawnBall(owner,damage,speed,life,kind,radius,knockback,hitstun){this.projectiles.push(new Projectile(owner.playerId,kind,{x:owner.x+owner.facing*75,y:owner.y-105,vx:owner.facing*speed,vy:rand(-15,15),life,radius,damage,knockback,hitstun,color:'#fff'}));sound.tone(300,.06,'triangle',.08,500);}
    spawnChicken(owner,move){this.projectiles.push(new Projectile(owner.playerId,'chicken',{x:owner.x+owner.facing*70,y:owner.y-115,vx:owner.facing*520,vy:-25,life:.38,radius:30,damage:move.damage,knockback:move.knockback,hitstun:move.hitstun,color:'#ffe8b5'}));sound.tone(520,.08,'square',.08,380);}
    explosion(x,y,radius,color){sound.special();this.shake=25;for(let i=0;i<55;i++)this.particles.push(new Particle(x,y,{vx:rand(-520,520),vy:rand(-520,180),life:rand(.35,.85),size:rand(5,18),color:i%3===0?'#fff06a':i%2===0?'#ff562e':color,gravity:700,shape:i%4===0?'square':'circle'}));this.particles.push({life:.38,max:.38,x,y,radius,update(dt){this.life-=dt;},draw(ctx){const p=1-this.life/this.max;ctx.save();ctx.globalAlpha=1-p;ctx.strokeStyle='#fff4a6';ctx.lineWidth=20*(1-p);ctx.beginPath();ctx.arc(this.x,this.y,this.radius*p,0,Math.PI*2);ctx.stroke();ctx.restore();}});}
    burst(x,y,color,count=14,power=1){for(let i=0;i<count;i++)this.particles.push(new Particle(x,y,{vx:rand(-230,230)*power,vy:rand(-300,70)*power,life:rand(.25,.55),size:rand(3,10)*power,color,gravity:850}));}
    floatText(x,y,text,color){this.floaters.push({x,y,text,color,life:.8,max:.8});}
    finishByTime(){const a=this.players[1].health,b=this.players[2].health;if(a===b){this.suddenDeath=true;this.timer=15;announce('MORTE SÚBITA','Morte súbita');return;}this.endRound(a>b?1:2,'Maior vida ao fim do tempo');}
    endRound(winner,reason){if(!this.roundActive)return;this.roundActive=false;this.roundWins[winner]++;updateHud(this);announce('NOCAUTE!',reason==='Maior vida ao fim do tempo'?'Tempo esgotado': 'Nocaute');setTimeout(()=>{if(this.roundWins[winner]>=GAME.roundsToWin)this.endMatch(winner,reason);else{this.round++;this.startRound();}},2200);}
    endMatch(winner,reason){this.running=false;const f=this.fighterData[winner];dom.resultTitle.textContent=`${f.name} VENCEU!`;dom.resultPortrait.src=f.portrait;dom.resultSubtitle.textContent=`Vitória por ${this.roundWins[winner]} rounds. ${reason}.`;showScreen('resultScreen');speak(`${f.name} venceu o CPX Fight!`);}
    togglePause(){this.paused=!this.paused;dom.pauseButton.textContent=this.paused?'▶':'Ⅱ';if(this.paused)announce('PAUSADO','');}
    drawBackground(ctx){
      const w=GAME.arenaWidth,h=GAME.arenaHeight;const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#151a31');grad.addColorStop(.58,'#24223b');grad.addColorStop(1,'#090b12');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#28233b';ctx.fillRect(0,125,w,350);for(let i=0;i<28;i++){const x=(i*67+Math.sin(this.backgroundTime*.7+i)*10)%w;const y=170+(i%4)*68;ctx.fillStyle=i%2?'rgba(255,79,100,.26)':'rgba(57,160,255,.24)';ctx.beginPath();ctx.arc(x,y,18+(i%3)*4,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#111522';ctx.fillRect(0,465,w,155);ctx.fillStyle='#222838';for(let x=0;x<w;x+=80){ctx.fillRect(x,480,50,100)}
      const floor=ctx.createLinearGradient(0,560,0,720);floor.addColorStop(0,'#444250');floor.addColorStop(1,'#171922');ctx.fillStyle=floor;ctx.fillRect(0,560,w,160);
      ctx.strokeStyle='rgba(242,193,78,.28)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,610);ctx.lineTo(w,610);ctx.stroke();
      ctx.font='900 170px Impact';ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillText('CPX',w/2,420);
    }
    draw(){const ctx=this.ctx;ctx.save();const sx=this.shake?rand(-this.shake,this.shake):0,sy=this.shake?rand(-this.shake*.5,this.shake*.5):0;ctx.translate(sx,sy);this.drawBackground(ctx);this.players[1].draw(ctx);this.players[2].draw(ctx);this.projectiles.forEach(p=>p.draw(ctx));this.particles.forEach(p=>p.draw(ctx));this.floaters.forEach(f=>{ctx.save();ctx.globalAlpha=f.life/f.max;ctx.fillStyle=f.color;ctx.strokeStyle='#000';ctx.lineWidth=6;ctx.font='900 28px Impact';ctx.textAlign='center';ctx.strokeText(f.text,f.x,f.y);ctx.fillText(f.text,f.x,f.y);ctx.restore();});ctx.restore();if(this.paused){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#fff';ctx.font='900 86px Impact';ctx.textAlign='center';ctx.fillText('PAUSADO',640,360);}}
  }

  function updateHud(engine) {
    const p1=engine.players[1],p2=engine.players[2];
    dom.p1HealthFill.style.width=`${p1.health/p1.maxHealth*100}%`;dom.p2HealthFill.style.width=`${p2.health/p2.maxHealth*100}%`;
    dom.p1MeterFill.style.width=`${p1.meter}%`;dom.p2MeterFill.style.width=`${p2.meter}%`;
    dom.p1RoundWins.textContent=`${engine.roundWins[1]>=1?'●':'○'} ${engine.roundWins[1]>=2?'●':'○'}`;dom.p2RoundWins.textContent=`${engine.roundWins[2]>=1?'●':'○'} ${engine.roundWins[2]>=2?'●':'○'}`;
    dom.roundLabel.textContent=engine.suddenDeath?'MORTE SÚBITA':`ROUND ${engine.round}`;const total=Math.max(0,Math.ceil(engine.timer));dom.timerLabel.textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
  }

  function startMatch() {
    const f1=app.chosen.p1,f2=app.chosen.p2;showScreen('fightScreen');
    dom.p1HudPortrait.src=f1.portrait;dom.p2HudPortrait.src=f2.portrait;dom.p1HudName.textContent=`${f1.name} · ${f1.nickname}`;dom.p2HudName.textContent=`${f2.name} · ${f2.nickname}`;
    app.engine=new GameEngine(dom.canvas,f1,f2);app.engine.start();
  }

  function bindEvents() {
    window.addEventListener('keydown',e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
      if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);sound.ensure();
      if(app.screen==='selectScreen'){
        if(e.code==='KeyA')moveSelection(1,-1);if(e.code==='KeyD')moveSelection(1,1);if(e.code==='KeyF')confirmSelection(1);
        if(e.code==='ArrowLeft')moveSelection(2,-1);if(e.code==='ArrowRight')moveSelection(2,1);if(e.code==='KeyJ')confirmSelection(2);
      }
      if(e.code==='Escape'&&app.engine)app.engine.togglePause();
    });
    window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
    dom.playButton.addEventListener('click',()=>{app.select={p1:0,p2:1,ready1:false,ready2:false};renderSelection();showScreen('selectScreen');sound.confirm();});
    dom.controlsButton.addEventListener('click',()=>dom.controlsDialog.showModal());dom.closeControlsButton.addEventListener('click',()=>dom.controlsDialog.close());
    dom.backToMenuButton.addEventListener('click',()=>showScreen('menuScreen'));
    dom.p1Roster.addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(!b)return;app.select.p1=Number(b.dataset.index);app.select.ready1=false;renderSelection();});
    dom.p2Roster.addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(!b)return;app.select.p2=Number(b.dataset.index);app.select.ready2=false;renderSelection();});
    dom.pauseButton.addEventListener('click',()=>app.engine?.togglePause());
    dom.rematchButton.addEventListener('click',()=>startMatch());dom.changeFightersButton.addEventListener('click',()=>{app.select.ready1=false;app.select.ready2=false;renderSelection();showScreen('selectScreen');});
  }

  bindEvents(); preload();
})();
