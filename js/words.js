const Words = (() => {
  const easy = [
    'hack','code','fire','byte','kill','data','node','loop','wire','flux',
    'core','dead','scan','grid','void','echo','trap','burn','dash','bolt',
    'sync','push','pull','drop','type','rage','zero','neon','glitch','wave',
    'hit','run','cmd','sys','exe','bat','ram','cpu','gpu','ssh'
  ];

  const medium = [
    'attack','delete','buffer','system','player','damage','weapon','shield',
    'server','bypass','inject','reboot','decode','cipher','matrix','vector',
    'signal','syntax','runtime','upload','download','network','firewall','hacker',
    'exploit','payload','command','execute','process','compile','pointer','socket',
    'packet','token','access','denied','breach','target','hunter','shadow',
    'phantom','vortex','blaster','striker','crawler','scanner','tracker','ghost'
  ];

  const hard = [
    'keystroke','algorithm','malware','ransomware','decryption','encryption',
    'processor','keyboard','terminal','directory','extension','interface',
    'catastrophe','deployment','parameter','bandwidth','hyperlink','mainframe',
    'architecture','penetration','credentials','rootkit','backdoor','vulnerability',
    'obfuscation','polymorphic','executable','initialize','compilation','recursion',
    'hexadecimal','peripheral','configuration','optimization','authentication',
    'distributed','subroutine','middleware','microservice','synchronization'
  ];

  const boss = [
    'INITIATE OVERRIDE SEQUENCE',
    'EXECUTE SYSTEM CORRUPTION',
    'BYPASS SECURITY PROTOCOL',
    'ACTIVATE KILLSWITCH NOW',
    'DEPLOY FINAL PAYLOAD',
    'OVERRIDE ALL SYSTEMS',
    'TERMINATE ALL PROCESSES',
    'UNLEASH THE KEYSTORM'
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
