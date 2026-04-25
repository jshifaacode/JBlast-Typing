const Words = (() => {
  const easy = [
     'sus','cegil','fomo','gokil','gas','mbg','izin','hts','relate',
      'cringe','sus','mabar','clingy','baper','mager','bucin','gabut',
      'dawg','spill','slay','vibe','plenger','kocak', 'bro',
      'galau','kepo','alay','asik','mantap','crush','kicau','gamon'
  ];

  const medium = [
    'prikitiw','fineshyt','kalcer','yapping','asyiap',
    'validasi','ekspektasi','realita','kelas king','dejavu',
    'bolang','friendlly','gimmick','furab','wibu',
    'respect','santuy','excited','salting','recehan',
    'miris','ghosting','bahlil','jokowi','esempe',
    ];

  const hard = [  
    'overthinking','mie ayam','spotify',
    'waspada','understand','miscommunication',
    'misinterpretasi','Sangat gokil','selfdiagnosis',
    'quarterlifecrisis','overcomplicated','underestimated',
    'hyperfixation','instantgratification','delusional',
  ];

  const boss = [
    'LAU SAPE MPRUY',
    'KASIH PAHAM BOS',
    'KATAKAN WHEN YAH',
    'SAJA ADA ADA',
    'DIT TOLONGIN DIT',
    'KASIH PAHAM BRAY',
    'HIDUP JOKOWI',
    'HEY ANTEK ASING'
  ];

  const glitch = (word) => {
    const chars = word.split('');
    const glitchChars = '@#$%&*!?^~';
    return chars.map((c, i) => {
      if (c === ' ') return c;
      return Math.random() < 0.3 ? glitchChars[Math.floor(Math.random() * glitchChars.length)] : c;
    }).join('');
  };

  const hideChars = (word) => {
    return word.split('').map((c, i) => {
      if (c === ' ') return c;
      return i % 3 === 0 ? '_' : c;
    }).join('');
  };

  return {
    getEasy: () => easy[Math.floor(Math.random() * easy.length)],
    getMedium: () => medium[Math.floor(Math.random() * medium.length)],
    getHard: () => hard[Math.floor(Math.random() * hard.length)],
    getBoss: () => boss[Math.floor(Math.random() * boss.length)],
    getByWave: (wave) => {
      if (wave <= 2) return Words.getEasy();
      if (wave <= 5) return Words.getMedium();
      return Words.getHard();
    },
    glitch,
    hideChars,
    getAll: () => [...easy, ...medium, ...hard]
  };
})();
