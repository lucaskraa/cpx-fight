(() => {
  'use strict';

  const DATA = window.CPX_DATA;
  if (!DATA || !Array.isArray(DATA.fighters)) {
    throw new Error('CPX_DATA não foi carregado.');
  }

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (min, max) => min + Math.random() * (max - min);
  const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const dom = {
    loadingScreen: $('loadingScreen'), loadingFill: $('loadingFill'), loadingStatus: $('loadingStatus'),
    selectScreen: $('selectScreen'), fighterGrid: $('fighterGrid'),
    p1ChosenName: $('p1ChosenName'), p1ChosenStyle: $('p1ChosenStyle'), p1Ready: $('p1Ready'),
    p2ChosenName: $('p2ChosenName'), p2ChosenStyle: $('p2ChosenStyle'), p2Ready: $('p2Ready'),
    startMatchButton: $('startMatchButton'),
    battleScreen: $('battleScreen'), canvas: $('gameCanvas'), announcement: $('fightAnnouncement'),
    p1Portrait: $('p1Portrait'), p2Portrait: $('p2Portrait'), p1HudName: $('p1HudName'), p2HudName: $('p2HudName'),
    p1HealthFill: $('p1HealthFill'), p2HealthFill: $('p2HealthFill'), p1HealthText: $('p1HealthText'), p2HealthText: $('p2HealthText'),
    p1MeterFill: $('p1MeterFill'), p2MeterFill: $('p2MeterFill'), p1Rounds: $('p1Rounds'), p2Rounds: $('p2Rounds'),
    roundLabel: $('roundLabel'), timerLabel: $('timerLabel'),
    pauseButton: $('pauseButton'), backToSelectButton: $('backToSelectButton'),
    pauseModal: $('pauseModal'), resumeButton: $('resumeButton'), quitButton: $('quitButton'),
    resultModal: $('resultModal'), resultEyebrow: $('resultEyebrow'), resultTitle: $('resultTitle'), resultSubtitle: $('resultSubtitle'),
    rematchButton: $('rematchButton'), selectAgainButton: $('selectAgainButton')
  };

  const assetImages = new Map();
  const fighterById = new Map(DATA.fighters.map((fighter) => [fighter.id, fighter]));
  const screens = [dom.loadingScreen, dom.selectScreen, dom.battleScreen];
  let activeScreen = 'loading';
  let game = null;

  function setScreen(name) {
    activeScreen = name;
    screens.forEach((screen) => screen.classList.remove('is-active'));
    if (name === 'loading') dom.loadingScreen.classList.add('is-active');
    if (name === 'select') dom.selectScreen.classList.add('is-active');
    if (name === 'battle') dom.battleScreen.classList.add('is-active');
  }

  function loadImage(key, src, onProgress) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        assetImages.set(key, image);
        onProgress();
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Falha ao carregar ${key}`));
      image.src = src;
    });
  }

  async function preloadAssets() {
    const jobs = [];
    DATA.fighters.forEach((fighter) => {
      jobs.push([`${fighter.id}:card`, fighter.card]);
      jobs.push([`${fighter.id}:sheet`, fighter.sheet]);
      jobs.push([`${fighter.id}:portrait`, fighter.portrait]);
    });
    Object.entries(DATA.assets).forEach(([name, src]) => jobs.push([`asset:${name}`, src]));
    let finished = 0;
    const update = () => {
      finished += 1;
      const ratio = finished / jobs.length;
      dom.loadingFill.style.width = `${Math.round(ratio * 100)}%`;
      dom.loadingStatus.textContent = `Carregando sprites ${finished}/${jobs.length}`;
    };
    await Promise.all(jobs.map(([key, src]) => loadImage(key, src, update)));
    dom.loadingStatus.textContent = 'Todos os sprites carregados.';
    await new Promise((resolve) => setTimeout(resolve, 320));
  }

  class InputManager {
    constructor() {
      this.down = new Set();
      this.tapped = new Set();
      this.gameKeys = new Set(['KeyA','KeyD','KeyW','KeyS','KeyF','KeyG','KeyH','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyJ','KeyK','KeyL','Enter','Escape','Space']);
      window.addEventListener('keydown', (event) => {
        if (this.gameKeys.has(event.code)) event.preventDefault();
        if (!this.down.has(event.code)) this.tapped.add(event.code);
        this.down.add(event.code);
        handleGlobalKeyDown(event.code);
      });
      window.addEventListener('keyup', (event) => {
        if (this.gameKeys.has(event.code)) event.preventDefault();
        this.down.delete(event.code);
      });
      window.addEventListener('blur', () => this.clear());
    }
    held(code) { return this.down.has(code); }
    tap(code) { return this.tapped.has(code); }
    endFrame() { this.tapped.clear(); }
    clear() { this.down.clear(); this.tapped.clear(); }
  }

  const input = new InputManager();

  class AudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.enabled = true;
    }
    ensure() {
      if (this.context) {
        if (this.context.state === 'suspended') this.context.resume();
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.context.destination);
    }
    tone(frequency = 220, duration = .12, type = 'square', volume = .12, slide = 0) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.start(now); oscillator.stop(now + duration + .02);
    }
    noise(duration = .12, volume = .08) {
      if (!this.enabled) return;
      this.ensure();
      if (!this.context) return;
      const rate = this.context.sampleRate;
      const buffer = this.context.createBuffer(1, Math.ceil(rate * duration), rate);
      const values = buffer.getChannelData(0);
      for (let i = 0; i < values.length; i += 1) values[i] = (Math.random() * 2 - 1) * (1 - i / values.length);
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = volume;
      source.connect(gain); gain.connect(this.master); source.start();
    }
    hit(strength = 1) { this.tone(125 - strength * 18, .09 + strength * .035, 'sawtooth', .11, -48); this.noise(.09, .065 * strength); }
    kick() { this.tone(92, .16, 'square', .14, -30); this.noise(.13, .08); }
    projectile() { this.tone(430, .08, 'triangle', .07, 170); }
    explosion() { this.tone(72, .42, 'sawtooth', .18, -35); this.noise(.38, .18); }
    special() { this.tone(190, .42, 'sawtooth', .12, 520); this.tone(95, .48, 'square', .1, 120); }
    confirm() { this.tone(420, .09, 'triangle', .08, 180); }
    announce(text, priority = true) {
      if (!('speechSynthesis' in window)) return;
      if (priority) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find((voice) => /pt[-_]?br/i.test(voice.lang) && /male|masc|ricardo|antonio|google/i.test(voice.name)) || voices.find((voice) => /pt[-_]?br/i.test(voice.lang)) || voices[0] || null;
      utterance.lang = utterance.voice?.lang || 'pt-BR';
      utterance.rate = .80;
      utterance.pitch = .55;
      utterance.volume = .9;
      speechSynthesis.speak(utterance);
    }
  }

  const audio = new AudioEngine();

  const selection = {
    p1Index: 0,
    p2Index: 1,
    p1Ready: false,
    p2Ready: false
  };

  function renderFighterCards() {
    dom.fighterGrid.innerHTML = '';
    DATA.fighters.forEach((fighter, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fighter-card';
      button.style.setProperty('--fighter', fighter.color);
      button.dataset.index = String(index);
      button.innerHTML = `
        <img src="${fighter.card}" alt="${fighter.name} — ${fighter.title}">
        <div class="fighter-card__markers"><span class="marker marker--p1">J1</span><span class="marker marker--p2">J2</span></div>
        <div class="fighter-card__info"><strong>${fighter.name}</strong><span>${fighter.title}</span></div>`;
      button.addEventListener('click', () => {
        audio.ensure();
        if (!selection.p1Ready) selection.p1Index = index;
        else if (!selection.p2Ready) selection.p2Index = index;
        else {
          selection.p1Ready = false;
          selection.p2Ready = false;
          selection.p1Index = index;
        }
        updateSelectionUI();
      });
      dom.fighterGrid.appendChild(button);
    });
    updateSelectionUI();
  }

  function moveSelection(player, direction) {
    const key = player === 1 ? 'p1Index' : 'p2Index';
    const ready = player === 1 ? selection.p1Ready : selection.p2Ready;
    if (ready) return;
    selection[key] = (selection[key] + direction + DATA.fighters.length) % DATA.fighters.length;
    audio.tone(320, .05, 'triangle', .04, direction * 80);
    updateSelectionUI();
  }

  function toggleReady(player) {
    if (player === 1) selection.p1Ready = !selection.p1Ready;
    else selection.p2Ready = !selection.p2Ready;
    audio.confirm();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const p1 = DATA.fighters[selection.p1Index];
    const p2 = DATA.fighters[selection.p2Index];
    [...dom.fighterGrid.children].forEach((card, index) => {
      card.classList.toggle('is-p1', index === selection.p1Index);
      card.classList.toggle('is-p2', index === selection.p2Index);
    });
    dom.p1ChosenName.textContent = `${p1.name} · ${p1.title}`;
    dom.p1ChosenStyle.textContent = selection.p1Ready ? `${p1.style} · confirmado` : `${p1.style} · A / D para escolher · F para confirmar`;
    dom.p2ChosenName.textContent = `${p2.name} · ${p2.title}`;
    dom.p2ChosenStyle.textContent = selection.p2Ready ? `${p2.style} · confirmado` : `${p2.style} · ← / → para escolher · J para confirmar`;
    dom.p1Ready.textContent = selection.p1Ready ? 'PRONTO' : 'AGUARDANDO';
    dom.p2Ready.textContent = selection.p2Ready ? 'PRONTO' : 'AGUARDANDO';
    dom.p1Ready.classList.toggle('is-ready', selection.p1Ready);
    dom.p2Ready.classList.toggle('is-ready', selection.p2Ready);
    const both = selection.p1Ready && selection.p2Ready;
    dom.startMatchButton.disabled = !both;
    dom.startMatchButton.textContent = both ? 'COMEÇAR A LUTA' : 'OS DOIS PRECISAM CONFIRMAR';
  }

  function handleGlobalKeyDown(code) {
    audio.ensure();
    if (activeScreen === 'select') {
      if (code === 'KeyA') moveSelection(1, -1);
      if (code === 'KeyD') moveSelection(1, 1);
      if (code === 'KeyF') toggleReady(1);
      if (code === 'ArrowLeft') moveSelection(2, -1);
      if (code === 'ArrowRight') moveSelection(2, 1);
      if (code === 'KeyJ') toggleReady(2);
      if (code === 'Enter' && selection.p1Ready && selection.p2Ready) startSelectedMatch();
    } else if (activeScreen === 'battle' && code === 'Escape') {
      if (game) game.togglePause();
    }
  }

  function startSelectedMatch() {
    const p1 = DATA.fighters[selection.p1Index];
    const p2 = DATA.fighters[selection.p2Index];
    setScreen('battle');
    dom.pauseModal.classList.remove('is-open');
    dom.resultModal.classList.remove('is-open');
    game?.destroy();
    game = new FightGame(dom.canvas, p1, p2);
    game.start();
  }

  class Fighter {
    constructor(game, config, playerNumber) {
      this.game = game;
      this.config = config;
      this.player = playerNumber;
      this.sheet = assetImages.get(`${config.id}:sheet`);
      this.x = playerNumber === 1 ? 350 : 930;
      this.y = game.groundY;
      this.vx = 0;
      this.vy = 0;
      this.facing = playerNumber === 1 ? 1 : -1;
      this.health = 100;
      this.meter = 0;
      this.state = 'idle';
      this.animTime = 0;
      this.attack = null;
      this.hitstun = 0;
      this.blockstun = 0;
      this.invulnerable = 0;
      this.grounded = true;
      this.blocking = false;
      this.flash = 0;
      this.alpha = 1;
      this.dead = false;
      this.attackSerial = 0;
      this.lastHitSerial = -1;
      this.width = 84;
      this.height = 188;
      this.controls = playerNumber === 1
        ? { left:'KeyA', right:'KeyD', jump:'KeyW', block:'KeyS', punch:'KeyF', kick:'KeyG', special:'KeyH' }
        : { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', block:'ArrowDown', punch:'KeyJ', kick:'KeyK', special:'KeyL' };
    }

    reset() {
      this.x = this.player === 1 ? 350 : 930;
      this.y = this.game.groundY;
      this.vx = 0; this.vy = 0;
      this.facing = this.player === 1 ? 1 : -1;
      this.health = 100; this.meter = 0;
      this.state = 'idle'; this.animTime = 0; this.attack = null;
      this.hitstun = 0; this.blockstun = 0; this.invulnerable = 0;
      this.grounded = true; this.blocking = false; this.flash = 0; this.dead = false; this.alpha = 1;
    }

    get bodyBox() {
      return { x: this.x - this.width / 2, y: this.y - this.height, w: this.width, h: this.height };
    }

    getOpponent() { return this.player === 1 ? this.game.fighters[1] : this.game.fighters[0]; }

    update(dt) {
      this.animTime += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      if (this.dead) return;

      if (this.hitstun > 0) {
        this.hitstun -= dt;
        this.state = 'hurt';
        this.applyPhysics(dt);
        if (this.hitstun <= 0) this.state = 'idle';
        return;
      }
      if (this.blockstun > 0) {
        this.blockstun -= dt;
        this.state = 'block';
        this.applyPhysics(dt);
        return;
      }
      if (this.attack) {
        this.updateAttack(dt);
        this.applyPhysics(dt);
        return;
      }

      const opponent = this.getOpponent();
      if (opponent && !opponent.dead) this.facing = opponent.x >= this.x ? 1 : -1;

      this.blocking = input.held(this.controls.block) && this.grounded;
      if (this.blocking) {
        this.state = 'block';
        this.vx *= .72;
      } else {
        const direction = (input.held(this.controls.right) ? 1 : 0) - (input.held(this.controls.left) ? 1 : 0);
        if (direction) {
          this.vx = direction * this.config.stats.speed;
          this.state = this.grounded ? 'walk' : 'jump';
        } else {
          this.vx *= this.grounded ? .68 : .96;
          if (Math.abs(this.vx) < 4) this.vx = 0;
          this.state = this.grounded ? 'idle' : 'jump';
        }
        if (input.tap(this.controls.jump) && this.grounded) {
          this.vy = -this.config.stats.jump;
          this.grounded = false;
          this.state = 'jump';
          this.game.addDust(this.x, this.y, this.config.color, 6);
          audio.tone(180, .1, 'triangle', .04, 120);
        }
        if (input.tap(this.controls.punch)) this.beginAttack('punch');
        else if (input.tap(this.controls.kick)) this.beginAttack('kick');
        else if (input.tap(this.controls.special)) {
          if (this.meter >= 100) this.beginAttack('special');
          else {
            this.game.addText(this.x, this.y - 220, 'ESPECIAL NÃO CARREGADO', '#d8b4fe', .7, 17);
            audio.tone(110, .08, 'square', .04, -20);
          }
        }
      }
      this.applyPhysics(dt);
    }

    applyPhysics(dt) {
      if (!this.grounded) this.vy += 1900 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= this.game.groundY) {
        if (!this.grounded && this.vy > 300) this.game.addDust(this.x, this.game.groundY, '#d9d4c5', 5);
        this.y = this.game.groundY;
        this.vy = 0;
        this.grounded = true;
      }
      this.x = clamp(this.x, 76, 1204);
    }

    beginAttack(type) {
      if (this.attack || this.dead || this.hitstun > 0) return;
      const move = this.config.moves[type];
      if (!move) return;
      if (type === 'special') {
        if (this.meter < 100) return;
        this.meter = 0;
        audio.special();
        this.game.shake = Math.max(this.game.shake, 6);
      }
      this.blocking = false;
      this.attackSerial += 1;
      this.attack = {
        type,
        elapsed: 0,
        duration: type === 'special' ? move.duration : move.startup + move.active + move.recovery,
        hit: false,
        events: new Set(),
        serial: this.attackSerial
      };
      this.state = type;
      this.animTime = 0;
    }

    updateAttack(dt) {
      const attack = this.attack;
      attack.elapsed += dt;
      this.state = attack.type;
      const type = attack.type;
      const move = this.config.moves[type];

      if (type === 'punch') {
        const activeStart = move.startup;
        const activeEnd = move.startup + move.active;
        if (!attack.hit && attack.elapsed >= activeStart && attack.elapsed <= activeEnd) {
          attack.hit = this.game.tryMeleeHit(this, move, 'punch');
          if (!attack.hit && attack.elapsed + dt >= activeEnd) attack.hit = true;
        }
      } else if (type === 'kick') {
        if (this.config.id === 'daniel') {
          this.triggerOnce('ball', .22, () => {
            this.game.spawnProjectile({ kind:'ball', owner:this, x:this.x + this.facing * 54, y:this.y - 72, vx:this.facing * 590, vy:-45, damage:move.damage, knockback:move.knockback, radius:21, maxDistance:move.range + 35, life:.62 });
            audio.projectile();
          });
        } else if (this.config.id === 'james') {
          this.triggerOnce('chicken', .23, () => {
            this.game.spawnProjectile({ kind:'chicken', owner:this, x:this.x + this.facing * 55, y:this.y - 90, vx:this.facing * 560, vy:-60, damage:move.damage, knockback:move.knockback, radius:27, maxDistance:move.range + 35, life:.70, spin:0 });
            audio.projectile();
          });
        } else {
          const activeStart = move.startup;
          const activeEnd = move.startup + move.active;
          if (!attack.hit && attack.elapsed >= activeStart && attack.elapsed <= activeEnd) {
            let damageBonus = 0;
            if (this.config.id === 'lucas' && Math.random() < .18) {
              damageBonus = 7;
              this.game.addText(this.x + this.facing * 95, this.y - 150, 'CRÍTICO!', '#ffb347', .75, 24);
            }
            attack.hit = this.game.tryMeleeHit(this, { ...move, damage: move.damage + damageBonus }, 'kick');
            if (!attack.hit && attack.elapsed + dt >= activeEnd) attack.hit = true;
          }
        }
      } else if (type === 'special') {
        this.updateSpecial();
      }

      if (attack.elapsed >= attack.duration) {
        this.attack = null;
        this.state = this.grounded ? 'idle' : 'jump';
      }
    }

    triggerOnce(name, time, callback) {
      if (!this.attack || this.attack.events.has(name) || this.attack.elapsed < time) return;
      this.attack.events.add(name);
      callback();
    }

    updateSpecial() {
      const id = this.config.id;
      if (id === 'zeca') {
        const events = [
          ['z1', .24, 5, 105, 110], ['z2', .48, 6, 110, 130], ['z3', .73, 7, 118, 150], ['z4', 1.02, 20, 165, 390]
        ];
        events.forEach(([key, time, damage, range, knockback], index) => {
          this.triggerOnce(key, time, () => {
            const opponent = this.getOpponent();
            const gap = opponent ? Math.abs(opponent.x - this.x) : 999;
            if (gap > 75 && gap < 310) this.x += this.facing * Math.min(66, gap - 70);
            const hit = this.game.tryMeleeHit(this, { damage, range, knockback, startup:0, active:.1, recovery:0 }, index === 3 ? 'specialKick' : 'specialPunch', true);
            this.game.addSlash(this.x + this.facing * 95, this.y - 105, this.config.accent, index === 3 ? 1.5 : 1);
            if (hit) audio.hit(index === 3 ? 1.7 : .8);
          });
        });
      } else if (id === 'daniel') {
        const times = [.25,.42,.59,.76,.93,1.10,1.27];
        times.forEach((time, index) => {
          this.triggerOnce(`ball${index}`, time, () => {
            const spread = (index - 3) * 18;
            this.game.spawnProjectile({ kind:'ball', owner:this, x:this.x + this.facing * 62, y:this.y - 100 + spread * .4, vx:this.facing * (690 + index * 18), vy:-140 + spread, damage:6, knockback:110, radius:18 + (index % 2) * 3, maxDistance:820, life:1.35, special:true });
            audio.projectile();
          });
        });
      } else if (id === 'lucas') {
        this.triggerOnce('charge', .25, () => {
          this.game.effects.push({ type:'aura', x:this.x, y:this.y - 92, time:0, duration:.9, color:'#7c3aed', size:110 });
          this.game.addText(this.x, this.y - 235, 'CAXIMBA CARREGADO!', '#d8b4fe', .85, 22);
        });
        this.triggerOnce('boom', .88, () => {
          const opponent = this.getOpponent();
          const targetX = opponent && Math.abs(opponent.x - this.x) < 500 ? opponent.x : this.x + this.facing * 260;
          const targetY = opponent ? opponent.y - 90 : this.y - 90;
          this.game.createExplosion(targetX, targetY, 185, 44, this, 470);
          audio.explosion();
        });
      } else if (id === 'james') {
        this.triggerOnce('tractor', .57, () => {
          this.game.spawnProjectile({ kind:'tractor', owner:this, x:this.x + this.facing * 105, y:this.game.groundY - 65, vx:this.facing * 660, vy:0, damage:46, knockback:610, radius:80, maxDistance:1200, life:2.1, special:true });
          this.invulnerable = 1.05;
          this.alpha = .25;
          audio.explosion();
        });
        if (this.attack.elapsed > 1.45) this.alpha = 1;
      }
    }

    takeDamage(damage, knockback, attacker, hitType = 'hit') {
      if (this.invulnerable > 0 || this.dead) return false;
      const facingAttacker = attacker ? (attacker.x >= this.x ? 1 : -1) : -this.facing;
      const isBlocking = this.blocking && this.grounded && this.facing === facingAttacker;
      const originalDamage = damage;
      if (isBlocking) {
        damage *= .24;
        knockback *= .28;
        this.blockstun = .18;
        this.state = 'block';
        this.game.addText(this.x, this.y - 190, 'DEFESA', '#93c5fd', .45, 16);
        audio.tone(310, .08, 'square', .06, -80);
      } else {
        this.hitstun = hitType === 'specialKick' || hitType === 'tractor' || hitType === 'explosion' ? .56 : .24 + damage * .008;
        this.state = 'hurt';
        this.attack = null;
        this.blocking = false;
        this.vy = hitType === 'tractor' || hitType === 'explosion' ? -360 : Math.min(this.vy, -90);
        if (this.vy < 0) this.grounded = false;
      }
      this.health = clamp(this.health - damage, 0, 100);
      this.vx = (attacker ? attacker.facing : -this.facing) * knockback / this.config.stats.weight;
      this.flash = .13;
      this.meter = clamp(this.meter + originalDamage * .75, 0, 100);
      if (attacker) attacker.meter = clamp(attacker.meter + originalDamage * 1.05, 0, 100);
      this.game.addHitEffect(this.x - (attacker?.facing || 1) * 30, this.y - 112, isBlocking ? '#60a5fa' : '#ffd166', originalDamage);
      this.game.shake = Math.max(this.game.shake, isBlocking ? 3 : 5 + originalDamage * .18);
      if (!isBlocking) audio.hit(clamp(originalDamage / 18, .5, 2));
      if (this.health <= 0) {
        this.dead = true;
        this.state = 'ko';
        this.attack = null;
        this.vy = -420;
        this.grounded = false;
        this.vx = (attacker?.facing || -this.facing) * 420;
      }
      return true;
    }

    animationFrame() {
      const animations = this.config.animations;
      let sequence = animations.idle;
      let progress = 0;
      if (this.dead || this.state === 'ko') {
        sequence = this.config.id === 'lucas' ? [11,10,9] : [7,6,5];
        progress = clamp((this.game.roundEndElapsed || 0) / 1.1, 0, .999);
      } else if (this.attack) {
        sequence = animations[this.attack.type] || animations.idle;
        progress = clamp(this.attack.elapsed / this.attack.duration, 0, .999);
      } else if (this.state === 'walk') {
        sequence = animations.walk;
        progress = (this.animTime * 5.4) % 1;
      } else if (this.state === 'jump') {
        sequence = animations.kick || animations.walk;
        return sequence[Math.min(sequence.length - 1, this.vy < 0 ? 0 : Math.floor(sequence.length / 2))];
      } else if (this.state === 'block') {
        sequence = animations.idle;
        return sequence[1] ?? sequence[0];
      } else if (this.state === 'hurt') {
        sequence = animations.idle;
        return sequence[sequence.length - 1];
      } else {
        sequence = animations.idle;
        progress = (this.animTime * 2.2) % 1;
      }
      return sequence[Math.min(sequence.length - 1, Math.floor(progress * sequence.length))];
    }

    draw(ctx) {
      const frame = this.animationFrame();
      const cell = DATA.sheetCell;
      const sx = (frame % 4) * cell;
      const sy = Math.floor(frame / 4) * cell;
      let drawW = 286;
      let drawH = 286;
      if (this.config.id === 'james' && this.attack?.type === 'special' && this.attack.elapsed > .5) {
        drawW = 410; drawH = 300;
      }
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y + 4);
      ctx.scale(this.facing, 1);
      if (this.blocking) ctx.scale(.94, .98);
      if (this.flash > 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 28;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,.75)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 10;
      }
      ctx.drawImage(this.sheet, sx, sy, cell, cell, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();

      if (this.meter >= 100 && !this.dead) {
        ctx.save();
        ctx.strokeStyle = this.config.color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = .45 + Math.sin(this.game.elapsed * 9) * .25;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 12, 68, 16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  class FightGame {
    constructor(canvas, p1Config, p2Config) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha:false });
      this.width = canvas.width;
      this.height = canvas.height;
      this.groundY = 618;
      this.fighters = [new Fighter(this, p1Config, 1), new Fighter(this, p2Config, 2)];
      this.projectiles = [];
      this.particles = [];
      this.effects = [];
      this.texts = [];
      this.running = false;
      this.paused = false;
      this.lastTime = 0;
      this.elapsed = 0;
      this.timer = 180;
      this.round = 1;
      this.roundWins = [0,0];
      this.phase = 'intro';
      this.introTime = 0;
      this.roundEndElapsed = 0;
      this.nextRoundTimer = 0;
      this.shake = 0;
      this.freeze = 0;
      this.raf = 0;
      this.announcementTimeout = null;
      this.updateHudIdentity();
    }

    start() {
      this.running = true;
      this.startRound();
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame((time) => this.loop(time));
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      clearTimeout(this.announcementTimeout);
      input.clear();
    }

    startRound() {
      this.timer = 180;
      this.phase = 'intro';
      this.introTime = 0;
      this.roundEndElapsed = 0;
      this.projectiles.length = 0;
      this.particles.length = 0;
      this.effects.length = 0;
      this.texts.length = 0;
      this.fighters.forEach((fighter) => fighter.reset());
      this.updateHud();
      dom.roundLabel.textContent = `ROUND ${this.round}`;
      this.showAnnouncement(`ROUND ${this.round}`, 780);
      audio.announce(`Round ${this.round}`, true);
      setTimeout(() => {
        if (this.running && this.phase === 'intro') {
          this.showAnnouncement('FIGHT!', 760);
          audio.announce('Fight!', true);
        }
      }, 1000);
    }

    loop(time) {
      if (!this.running) return;
      const dt = Math.min(.034, Math.max(0, (time - this.lastTime) / 1000));
      this.lastTime = time;
      if (!this.paused) {
        if (this.freeze > 0) this.freeze -= dt;
        else this.update(dt);
      }
      this.render();
      input.endFrame();
      this.raf = requestAnimationFrame((next) => this.loop(next));
    }

    update(dt) {
      this.elapsed += dt;
      this.shake = Math.max(0, this.shake - dt * 24);
      this.updateParticles(dt);
      this.updateEffects(dt);
      this.updateTexts(dt);

      if (this.phase === 'intro') {
        this.introTime += dt;
        if (this.introTime >= 1.85) this.phase = 'fight';
        return;
      }

      if (this.phase === 'fight') {
        this.timer = Math.max(0, this.timer - dt);
        this.fighters.forEach((fighter) => fighter.update(dt));
        this.resolveFighterCollision();
        this.updateProjectiles(dt);
        this.updateHud();
        const dead = this.fighters.findIndex((fighter) => fighter.health <= 0);
        if (dead !== -1) {
          this.endRound(dead === 0 ? 1 : 0, 'K.O.');
          return;
        }
        if (this.timer <= 0) {
          const h1 = this.fighters[0].health;
          const h2 = this.fighters[1].health;
          if (Math.abs(h1 - h2) < .01) {
            this.timer = 30;
            this.showAnnouncement('MORTE SÚBITA', 950);
            audio.announce('Morte súbita!', true);
            this.fighters.forEach((fighter) => { fighter.health = Math.min(fighter.health, 22); });
          } else {
            this.endRound(h1 > h2 ? 0 : 1, 'TEMPO ESGOTADO');
          }
        }
      } else if (this.phase === 'roundOver') {
        this.roundEndElapsed += dt;
        this.fighters.forEach((fighter) => fighter.applyPhysics(dt));
        if (this.roundEndElapsed >= this.nextRoundTimer) {
          const matchWinner = this.roundWins.findIndex((wins) => wins >= 2);
          if (matchWinner !== -1) this.showMatchResult(matchWinner);
          else {
            this.round += 1;
            this.startRound();
          }
        }
      }
    }

    resolveFighterCollision() {
      const [a,b] = this.fighters;
      if (a.dead || b.dead) return;
      const minGap = 78;
      const dx = b.x - a.x;
      if (Math.abs(dx) < minGap && Math.abs(a.y - b.y) < 110) {
        const push = (minGap - Math.abs(dx)) / 2;
        const sign = dx >= 0 ? 1 : -1;
        a.x -= push * sign;
        b.x += push * sign;
        a.x = clamp(a.x, 76, 1204);
        b.x = clamp(b.x, 76, 1204);
      }
    }

    tryMeleeHit(attacker, move, hitType = 'punch', forceMulti = false) {
      const target = attacker.getOpponent();
      if (!target || target.dead) return false;
      const vertical = Math.abs((attacker.y - 100) - (target.y - 100));
      const forwardDistance = (target.x - attacker.x) * attacker.facing;
      if (forwardDistance > -25 && forwardDistance <= move.range && vertical < 155) {
        const success = target.takeDamage(move.damage, move.knockback, attacker, hitType);
        if (success) {
          this.freeze = Math.max(this.freeze, hitType.includes('special') ? .075 : .04);
          this.addSlash(target.x - attacker.facing * 35, target.y - 110, attacker.config.accent, hitType === 'kick' ? 1.2 : .8);
          return true;
        }
      }
      return forceMulti ? false : false;
    }

    spawnProjectile(data) {
      this.projectiles.push({
        ...data,
        id: `${data.kind}-${performance.now()}-${Math.random()}`,
        startX: data.x,
        age: 0,
        rotation: 0,
        hit: false
      });
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
        const projectile = this.projectiles[i];
        projectile.age += dt;
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.rotation += (projectile.spin || projectile.vx * .012) * dt;
        if (projectile.kind === 'ball' || projectile.kind === 'chicken') projectile.vy += 330 * dt;
        const target = projectile.owner.getOpponent();
        if (!projectile.hit && target && !target.dead) {
          const box = target.bodyBox;
          const pbox = { x:projectile.x - projectile.radius, y:projectile.y - projectile.radius, w:projectile.radius*2, h:projectile.radius*2 };
          if (rectsOverlap(box, pbox)) {
            projectile.hit = target.takeDamage(projectile.damage, projectile.knockback, projectile.owner, projectile.kind === 'tractor' ? 'tractor' : 'projectile');
            if (projectile.kind === 'tractor') {
              this.createExplosion(target.x, target.y - 80, 115, 8, projectile.owner, 240, true);
            } else {
              this.addHitEffect(projectile.x, projectile.y, projectile.kind === 'ball' ? '#f8fafc' : '#fde68a', projectile.damage);
            }
          }
        }
        const travelled = Math.abs(projectile.x - projectile.startX);
        const expired = projectile.age > projectile.life || travelled > projectile.maxDistance || projectile.x < -180 || projectile.x > 1460 || projectile.y > 760;
        if (projectile.hit || expired) this.projectiles.splice(i, 1);
      }
    }

    createExplosion(x, y, radius, damage, owner, knockback, visualOnly = false) {
      this.effects.push({ type:'explosion', x, y, time:0, duration:.68, size:radius, color:'#ff8a24' });
      this.shake = Math.max(this.shake, 17);
      this.addDust(x, this.groundY, '#ff8a24', 18);
      if (!visualOnly) {
        const target = owner.getOpponent();
        if (target && Math.hypot(target.x - x, (target.y - 90) - y) <= radius + 58) {
          target.takeDamage(damage, knockback, owner, 'explosion');
        }
      }
    }

    endRound(winnerIndex, reason) {
      if (this.phase !== 'fight') return;
      this.phase = 'roundOver';
      this.roundWins[winnerIndex] += 1;
      this.nextRoundTimer = 2.8;
      this.roundEndElapsed = 0;
      const winner = this.fighters[winnerIndex];
      this.showAnnouncement(reason === 'K.O.' ? 'K.O.' : 'TEMPO!', 900);
      audio.announce(reason === 'K.O.' ? 'K O!' : 'Tempo esgotado!', true);
      setTimeout(() => {
        if (!this.running || this.phase !== 'roundOver') return;
        this.showAnnouncement(`${winner.config.name} VENCEU`, 1050);
        audio.announce(`${winner.config.name} venceu o round`, true);
      }, 950);
      this.updateHud();
    }

    showMatchResult(winnerIndex) {
      this.phase = 'matchOver';
      const winner = this.fighters[winnerIndex];
      dom.resultEyebrow.textContent = 'CAMPEÃO DO CONFRONTO';
      dom.resultTitle.textContent = `${winner.config.name} · ${winner.config.title}`;
      dom.resultTitle.style.color = winner.config.color;
      dom.resultSubtitle.textContent = `Venceu por ${this.roundWins[winnerIndex]} a ${this.roundWins[1-winnerIndex]}.`;
      dom.resultModal.classList.add('is-open');
      dom.resultModal.setAttribute('aria-hidden', 'false');
      audio.announce(`${winner.config.name} venceu a luta!`, true);
    }

    togglePause(force) {
      if (!this.running || this.phase === 'matchOver') return;
      this.paused = typeof force === 'boolean' ? force : !this.paused;
      dom.pauseModal.classList.toggle('is-open', this.paused);
      dom.pauseModal.setAttribute('aria-hidden', String(!this.paused));
      if (!this.paused) this.lastTime = performance.now();
    }

    showAnnouncement(text, duration = 800) {
      clearTimeout(this.announcementTimeout);
      dom.announcement.textContent = text;
      dom.announcement.classList.add('is-visible');
      this.announcementTimeout = setTimeout(() => dom.announcement.classList.remove('is-visible'), duration);
    }

    updateHudIdentity() {
      const [p1,p2] = this.fighters;
      dom.p1Portrait.src = p1.config.portrait;
      dom.p2Portrait.src = p2.config.portrait;
      dom.p1HudName.textContent = `${p1.config.name} · ${p1.config.title}`;
      dom.p2HudName.textContent = `${p2.config.name} · ${p2.config.title}`;
    }

    updateHud() {
      const [p1,p2] = this.fighters;
      dom.p1HealthFill.style.width = `${p1.health}%`;
      dom.p2HealthFill.style.width = `${p2.health}%`;
      dom.p1HealthText.textContent = Math.ceil(p1.health);
      dom.p2HealthText.textContent = Math.ceil(p2.health);
      dom.p1MeterFill.style.width = `${p1.meter}%`;
      dom.p2MeterFill.style.width = `${p2.meter}%`;
      dom.p1MeterFill.style.filter = p1.meter >= 100 ? 'brightness(1.55)' : '';
      dom.p2MeterFill.style.filter = p2.meter >= 100 ? 'brightness(1.55)' : '';
      dom.p1Rounds.textContent = `${this.roundWins[0] >= 1 ? '●' : '○'} ${this.roundWins[0] >= 2 ? '●' : '○'}`;
      dom.p2Rounds.textContent = `${this.roundWins[1] >= 1 ? '●' : '○'} ${this.roundWins[1] >= 2 ? '●' : '○'}`;
      const seconds = Math.max(0, Math.ceil(this.timer));
      dom.timerLabel.textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    }

    addDust(x, y, color, count = 8) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push({ x:x+random(-30,30), y:y-random(0,14), vx:random(-100,100), vy:random(-180,-40), gravity:360, life:random(.35,.75), maxLife:1, size:random(4,12), color, alpha:random(.45,.9), shape:'circle' });
      }
    }

    addHitEffect(x, y, color, damage) {
      const count = Math.round(clamp(damage, 6, 26));
      for (let i = 0; i < count; i += 1) {
        const angle = random(0, Math.PI*2);
        const speed = random(90, 360);
        this.particles.push({ x, y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, gravity:240, life:random(.22,.58), maxLife:1, size:random(3,9), color, alpha:1, shape:i%3===0?'line':'circle' });
      }
      this.addText(x, y - 30, `-${Math.round(damage)}`, '#ffffff', .48, 20);
    }

    addSlash(x, y, color, scale = 1) {
      this.effects.push({ type:'slash', x, y, time:0, duration:.28, size:75*scale, color, rotation:random(-.7,.7) });
    }

    addText(x, y, text, color, life = .7, size = 18) {
      this.texts.push({ x,y,text,color,life,maxLife:life,size });
    }

    updateParticles(dt) {
      for (let i=this.particles.length-1;i>=0;i-=1) {
        const p=this.particles[i]; p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.gravity*dt; p.vx*=.985;
        if (p.life<=0) this.particles.splice(i,1);
      }
    }
    updateEffects(dt) {
      for (let i=this.effects.length-1;i>=0;i-=1) { const e=this.effects[i]; e.time+=dt; if(e.time>=e.duration)this.effects.splice(i,1); }
    }
    updateTexts(dt) {
      for (let i=this.texts.length-1;i>=0;i-=1) { const t=this.texts[i];t.life-=dt;t.y-=42*dt;if(t.life<=0)this.texts.splice(i,1); }
    }

    render() {
      const ctx = this.ctx;
      ctx.save();
      const shakeX = this.shake > 0 ? random(-this.shake,this.shake) : 0;
      const shakeY = this.shake > 0 ? random(-this.shake*.6,this.shake*.6) : 0;
      ctx.translate(shakeX,shakeY);
      this.drawStage(ctx);
      this.drawProjectiles(ctx);
      this.fighters.forEach((fighter) => fighter.draw(ctx));
      this.drawParticles(ctx);
      this.drawEffects(ctx);
      this.drawTexts(ctx);
      ctx.restore();
      if (this.paused) {
        ctx.fillStyle='rgba(0,0,0,.36)';ctx.fillRect(0,0,this.width,this.height);
      }
    }

    drawStage(ctx) {
      const sky = ctx.createLinearGradient(0,0,0,this.height);
      sky.addColorStop(0,'#0c1027'); sky.addColorStop(.48,'#312342'); sky.addColorStop(1,'#191823');
      ctx.fillStyle=sky;ctx.fillRect(0,0,this.width,this.height);
      const glow=ctx.createRadialGradient(640,150,20,640,150,470);
      glow.addColorStop(0,'rgba(168,85,247,.22)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,this.width,this.height);
      // lighting rigs
      ctx.fillStyle='#090b14';ctx.fillRect(0,120,this.width,20);
      for(let x=35;x<this.width;x+=80){ctx.fillStyle=x%160===35?'#2e5c9d':'#89334f';ctx.globalAlpha=.64;ctx.beginPath();ctx.arc(x,180+(x%3)*48,18+(x%5),0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;
      // audience tiers
      ctx.fillStyle='#15182a';ctx.fillRect(0,310,this.width,160);
      for(let y=330;y<450;y+=42){for(let x=18;x<this.width;x+=48){const color=((x+y)/6)%2?'#315287':'#713248';ctx.fillStyle=color;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(x+(y%80),y,11,0,Math.PI*2);ctx.fill();}}
      ctx.globalAlpha=1;
      ctx.fillStyle='rgba(255,255,255,.045)';ctx.font='1000 120px Impact, sans-serif';ctx.textAlign='center';ctx.fillText('CPX',640,405);
      // barrier
      ctx.fillStyle='#080b16';ctx.fillRect(0,455,this.width,55);
      for(let x=0;x<this.width;x+=70){ctx.fillStyle='#20273b';ctx.fillRect(x,457,42,50);}
      // floor
      const floor=ctx.createLinearGradient(0,510,0,720);floor.addColorStop(0,'#3a3846');floor.addColorStop(.12,'#252533');floor.addColorStop(1,'#0d101a');ctx.fillStyle=floor;ctx.fillRect(0,510,this.width,210);
      ctx.strokeStyle='rgba(246,196,83,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,this.groundY+3);ctx.lineTo(this.width,this.groundY+3);ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=1;for(let x=0;x<this.width;x+=80){ctx.beginPath();ctx.moveTo(640,510);ctx.lineTo(x,720);ctx.stroke();}
      // shadows
      this.fighters.forEach((fighter)=>{ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(fighter.x,this.groundY+4,72,15,0,0,Math.PI*2);ctx.fill();});
    }

    drawProjectiles(ctx) {
      const chickenImage=assetImages.get('asset:chicken');
      const tractorImage=assetImages.get('asset:tractor');
      for(const p of this.projectiles){
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
        if(p.kind==='ball'){
          ctx.fillStyle='#f8fafc';ctx.strokeStyle='#111827';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,p.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#111827';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*p.radius*.48,Math.sin(a)*p.radius*.48,p.radius*.16,0,Math.PI*2);ctx.fill();}
        }else if(p.kind==='chicken'&&chickenImage){ctx.scale(p.owner.facing,1);ctx.drawImage(chickenImage,-55,-55,110,110);}
        else if(p.kind==='tractor'&&tractorImage){ctx.scale(p.owner.facing,1);ctx.drawImage(tractorImage,-210,-110,420,210);}
        ctx.restore();
      }
    }

    drawParticles(ctx) {
      for(const p of this.particles){const alpha=clamp(p.life/(p.maxLife||1),0,1)*p.alpha;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;if(p.shape==='line'){ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);ctx.stroke();}else{ctx.beginPath();ctx.arc(p.x,p.y,p.size*alpha,0,Math.PI*2);ctx.fill();}ctx.restore();}
    }

    drawEffects(ctx) {
      const explosionImage=assetImages.get('asset:explosion');
      for(const effect of this.effects){const t=clamp(effect.time/effect.duration,0,1);ctx.save();ctx.translate(effect.x,effect.y);ctx.globalAlpha=1-t;
        if(effect.type==='slash'){ctx.rotate(effect.rotation);ctx.strokeStyle=effect.color;ctx.lineWidth=10*(1-t)+2;ctx.beginPath();ctx.arc(0,0,effect.size*(.35+t),-1.4,1.15);ctx.stroke();}
        else if(effect.type==='aura'){ctx.strokeStyle=effect.color;ctx.lineWidth=7*(1-t)+2;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,effect.size*(.35+t*.8)+i*17,0,Math.PI*2);ctx.stroke();}}
        else if(effect.type==='explosion'){const size=effect.size*(.65+t*.8);if(explosionImage)ctx.drawImage(explosionImage,-size,-size,size*2,size*2);ctx.fillStyle=`rgba(255,245,170,${(1-t)*.65})`;ctx.beginPath();ctx.arc(0,0,size*.45,0,Math.PI*2);ctx.fill();}
        ctx.restore();}
    }

    drawTexts(ctx) {
      for(const text of this.texts){ctx.save();ctx.globalAlpha=clamp(text.life/text.maxLife,0,1);ctx.fillStyle=text.color;ctx.strokeStyle='rgba(0,0,0,.9)';ctx.lineWidth=6;ctx.font=`1000 ${text.size}px Inter, sans-serif`;ctx.textAlign='center';ctx.strokeText(text.text,text.x,text.y);ctx.fillText(text.text,text.x,text.y);ctx.restore();}
    }
  }

  dom.startMatchButton.addEventListener('click', startSelectedMatch);
  dom.pauseButton.addEventListener('click', () => game?.togglePause());
  dom.resumeButton.addEventListener('click', () => game?.togglePause(false));
  dom.quitButton.addEventListener('click', backToSelection);
  dom.backToSelectButton.addEventListener('click', backToSelection);
  dom.selectAgainButton.addEventListener('click', backToSelection);
  dom.rematchButton.addEventListener('click', () => {
    dom.resultModal.classList.remove('is-open');
    dom.resultModal.setAttribute('aria-hidden','true');
    startSelectedMatch();
  });

  function backToSelection() {
    game?.destroy();
    game = null;
    dom.pauseModal.classList.remove('is-open');
    dom.resultModal.classList.remove('is-open');
    selection.p1Ready = false;
    selection.p2Ready = false;
    input.clear();
    updateSelectionUI();
    setScreen('select');
  }

  window.__CPX_FIGHT_DEBUG__ = {
    start(p1='zeca',p2='daniel') {
      selection.p1Index = DATA.fighters.findIndex((f)=>f.id===p1);
      selection.p2Index = DATA.fighters.findIndex((f)=>f.id===p2);
      selection.p1Ready = true; selection.p2Ready = true; updateSelectionUI(); startSelectedMatch();
    },
    getState() {
      if (!game) return null;
      return { phase:game.phase, timer:game.timer, round:game.round, wins:[...game.roundWins], fighters:game.fighters.map((f)=>({id:f.config.id,x:f.x,y:f.y,health:f.health,meter:f.meter,state:f.state,frame:f.animationFrame(),attack:f.attack?.type||null})) };
    },
    setMeter(player,value=100){if(game)game.fighters[player-1].meter=clamp(value,0,100);},
    setHealth(player,value){if(game)game.fighters[player-1].health=clamp(value,0,100);},
    setTimer(value){if(game)game.timer=value;},
    bringClose(){if(game){game.fighters[0].x=560;game.fighters[1].x=690;}},
    forceFight(){if(game)game.phase='fight';}
  };

  async function init() {
    renderFighterCards();
    try {
      await preloadAssets();
      setScreen('select');
    } catch (error) {
      console.error(error);
      dom.loadingStatus.textContent = `Erro ao carregar sprites: ${error.message}`;
      dom.loadingStatus.style.color = '#fb7185';
    }
  }

  init();
})();
