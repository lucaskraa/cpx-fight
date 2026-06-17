window.CPX_FIGHT_DATA = {
  game: {
    title: "CPX FIGHT",
    subtitle: "O Complexo entrou na luta",
    roundSeconds: 180,
    roundsToWin: 2,
    arenaWidth: 1280,
    arenaHeight: 720,
    gravity: 2400,
    floorY: 610
  },
  fighters: [
    {
      id: "zeca",
      name: "ZECA",
      nickname: "FURÃO",
      style: "Muay Thai",
      portrait: "assets/portraits/zeca.jpg",
      sprite: "assets/sprites/zeca.png",
      accent: "#f6b93b",
      health: 1000,
      speed: 330,
      jumpPower: 890,
      body: { width: 112, height: 210 },
      moves: {
        punch: { name: "Direto do Furão", damage: 62, startup: 0.10, active: 0.11, recovery: 0.24, range: 105, hitstun: 0.24, knockback: 155, meter: 8 },
        kick: { name: "Chute Tailandês", damage: 94, startup: 0.18, active: 0.14, recovery: 0.31, range: 135, hitstun: 0.34, knockback: 245, meter: 12 },
        special: { name: "Sequência Furão", damage: 290, startup: 0.18, active: 0.90, recovery: 0.42, range: 205, hitstun: 0.65, knockback: 440, meterCost: 100, hits: 5, kind: "combo" }
      },
      bio: "Especialista em Muay Thai. Avança com uma sequência de socos e encerra com um chute pesado.",
      frameMap: { idle:[0,1], walk:[2,3], punch:[4,5,6,7], kick:[8,9,10,11], special:[12,13,14,15] }
    },
    {
      id: "daniel",
      name: "DANIEL",
      nickname: "O GOLEIRO",
      style: "Defesa e contra-ataque",
      portrait: "assets/portraits/daniel.jpg",
      sprite: "assets/sprites/daniel.png",
      accent: "#43a7ff",
      health: 1060,
      speed: 300,
      jumpPower: 820,
      body: { width: 116, height: 208 },
      moves: {
        punch: { name: "Tapão do Goleiro", damage: 58, startup: 0.09, active: 0.12, recovery: 0.22, range: 112, hitstun: 0.22, knockback: 145, meter: 8 },
        kick: { name: "Bola Curta", damage: 88, startup: 0.19, active: 0.10, recovery: 0.32, range: 150, hitstun: 0.30, knockback: 225, meter: 12, kind: "shortBall" },
        special: { name: "Bombardeio do Gol", damage: 270, startup: 0.24, active: 1.05, recovery: 0.46, range: 540, hitstun: 0.44, knockback: 340, meterCost: 100, hits: 6, kind: "multiBall" }
      },
      bio: "Goleiro de reflexos rápidos. Usa tapas, bolas de curto alcance e uma chuva de bolas no especial.",
      frameMap: { idle:[0,1], walk:[2,3], punch:[4,5,6,7], kick:[8,9,10,11], special:[12,13,14,15] }
    },
    {
      id: "lucas",
      name: "LUCAS",
      nickname: "BOMBA MAN",
      style: "Força explosiva",
      portrait: "assets/portraits/lucas.jpg",
      sprite: "assets/sprites/lucas.png",
      accent: "#ff6b35",
      health: 1130,
      speed: 285,
      jumpPower: 790,
      body: { width: 126, height: 212 },
      moves: {
        punch: { name: "Soco Pesado", damage: 72, startup: 0.13, active: 0.12, recovery: 0.27, range: 112, hitstun: 0.27, knockback: 180, meter: 9 },
        kick: { name: "Chute Torto", damage: 112, startup: 0.22, active: 0.14, recovery: 0.37, range: 146, hitstun: 0.38, knockback: 285, meter: 13, missChance: 0.16, critChance: 0.24, critMultiplier: 1.65 },
        special: { name: "Explosão Total", damage: 320, startup: 0.43, active: 0.32, recovery: 0.52, range: 270, hitstun: 0.72, knockback: 520, meterCost: 100, hits: 1, kind: "explosion" }
      },
      bio: "Lutador pesado. Seu chute pode sair torto, mas seu especial explode tudo que estiver perto.",
      frameMap: { idle:[0,1], walk:[2,3], punch:[4,5,6,7], kick:[8,9,10,11], special:[12,13,14,15] }
    },
    {
      id: "james",
      name: "JAMES",
      nickname: "AGRICULTOR DO CRIME",
      style: "Armas improvisadas",
      portrait: "assets/portraits/james.jpg",
      sprite: "assets/sprites/james.png",
      accent: "#7ed957",
      health: 1020,
      speed: 315,
      jumpPower: 835,
      body: { width: 114, height: 208 },
      moves: {
        punch: { name: "Enxadada", damage: 84, startup: 0.17, active: 0.15, recovery: 0.31, range: 145, hitstun: 0.34, knockback: 235, meter: 10 },
        kick: { name: "Galinha Voadora", damage: 82, startup: 0.20, active: 0.10, recovery: 0.34, range: 155, hitstun: 0.29, knockback: 210, meter: 12, kind: "chicken" },
        special: { name: "Trator do Crime", damage: 305, startup: 0.34, active: 1.00, recovery: 0.45, range: 760, hitstun: 0.78, knockback: 560, meterCost: 100, hits: 1, kind: "tractor" }
      },
      bio: "Ataca com uma enxada, arremessa uma galinha e atropela o adversário com um trator.",
      frameMap: { idle:[0,1], walk:[2,3], punch:[4,5,6,7], kick:[8,9,10,11], special:[12,13,14,15] }
    }
  ]
};
