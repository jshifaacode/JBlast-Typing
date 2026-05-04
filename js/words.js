const Words = (() => {
  const easy = [
    "sus",
    "cegil",
    "fomo",
    "gokil",
    "gas",
    "mbg",
    "izin",
    "hts",
    "relate",
    "cringe",
    "mabar",
    "clingy",
    "baper",
    "mager",
    "bucin",
    "gue",
    "dawg",
    "spill",
    "ceo",
    "vibe",
    "wibu",
    "kocak",
    "bro",
    "galau",
    "kepo",
    "alay",
    "asik",
    "damn",
    "crush",
    "kicau",
    "gamon",
  ];
  const medium = [
    "bolang",
    "fineshyt",
    "kalcer",
    "yapping",
    "asyiap",
    "validasi",
    "egiluy",
    "realita",
    "bolang",
    "dejavu",
    "prikitiw",
    "friendlly",
    "gimmick",
    "furab",
    "plenger",
    "respect",
    "santuy",
    "excited",
    "salting",
    "ngakak",
    "miris",
    "ghosting",
    "bahlil",
    "jokowi",
    "naksir",
  ];
  const hard = [
    "overthinking",
    "mieayam",
    "spotify",
    "jyujyur",
    "understand",
    "artistic",
    "dinosaurus",
    "sangatgokil",
    "selfrewards",
    "intimidasi",
    "aplikasi",
    "kesepian",
    "alamakkk",
    "awokawokawok",
    "halusinasi",
  ];
  const boss = [
    "lausapempruy",
    "kasihpahambos",
    "katakanwhenyah",
    "tidakfantash",
    "dittolongindit",
    "kasihpahambray",
    "hidupjokowi",
    "heyantekasing",
  ];

  function makeQueue(arr) {
    let q = [];
    return () => {
      if (q.length === 0) q = [...arr].sort(() => Math.random() - 0.5);
      return q.shift();
    };
  }

  const nextEasy = makeQueue(easy);
  const nextMedium = makeQueue(medium);
  const nextHard = makeQueue(hard);
  const nextBoss = makeQueue(boss);

  return {
    getEasy: () => nextEasy(),
    getMedium: () => nextMedium(),
    getHard: () => nextHard(),
    getBoss: () => nextBoss(),
    getByWave(wave) {
      if (wave <= 2) return Words.getEasy();
      if (wave <= 5) return Words.getMedium();
      return Words.getHard();
    },
    getAll: () => [...easy, ...medium, ...hard],
  };
})();
