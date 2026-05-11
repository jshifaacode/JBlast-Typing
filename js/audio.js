var GameAudio = (function () {
  var muted = false;
  var _bgm = null;
  var _bgmPlaying = false;
  var _ac = null;
  var BGM_SRC = "assets/yorunikakeru-yoasobi.mp3";

  function _initAc() {
    if (_ac) return;
    try {
      _ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }

  function _resumeAc() {
    if (_ac && _ac.state === "suspended")
      try {
        _ac.resume();
      } catch (e) {}
  }

  function _tone(freq, type, dur, gain) {
    if (muted || !_ac) return;
    _resumeAc();
    try {
      var o = _ac.createOscillator(),
        g = _ac.createGain();
      o.connect(g);
      g.connect(_ac.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, _ac.currentTime);
      g.gain.setValueAtTime(gain, _ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + dur);
      o.start();
      o.stop(_ac.currentTime + dur);
    } catch (e) {}
  }

  function _noise(dur, gain) {
    if (muted || !_ac) return;
    _resumeAc();
    try {
      var n = _ac.sampleRate * dur;
      var buf = _ac.createBuffer(1, n, _ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var s = _ac.createBufferSource(),
        g = _ac.createGain();
      g.gain.setValueAtTime(gain, _ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + dur);
      s.buffer = buf;
      s.connect(g);
      g.connect(_ac.destination);
      s.start();
    } catch (e) {}
  }

  function unlock() {
    _initAc();
    _resumeAc();
  }

  function playBgm() {
    _initAc();
    _resumeAc();
    if (muted) return;
    if (_bgm) {
      try {
        _bgm.pause();
      } catch (e) {}
      _bgm = null;
    }
    _bgmPlaying = false;
    try {
      _bgm = new window.Audio(BGM_SRC);
      _bgm.loop = true;
      _bgm.volume = 0.42;
      var p = _bgm.play();
      if (p && p.then) {
        p.then(function () {
          _bgmPlaying = true;
        }).catch(function () {
          _bgmPlaying = false;
        });
      } else {
        _bgmPlaying = true;
      }
    } catch (e) {
      _bgm = null;
      _bgmPlaying = false;
    }
  }

  function stopBgm(fade) {
    _bgmPlaying = false;
    if (!_bgm) return;
    var b = _bgm;
    _bgm = null;
    if (fade) {
      var v = b.volume,
        step = v / 18;
      var iv = setInterval(function () {
        v -= step;
        b.volume = Math.max(0, v);
        if (v <= 0) {
          clearInterval(iv);
          try {
            b.pause();
          } catch (e) {}
        }
      }, 55);
    } else {
      try {
        b.pause();
      } catch (e) {}
    }
  }

  function pauseBgm() {
    if (_bgm && !_bgm.paused)
      try {
        _bgm.pause();
      } catch (e) {}
  }

  function resumeBgm() {
    if (_bgm && _bgm.paused)
      try {
        _bgm.play().catch(function () {});
      } catch (e) {}
  }

  return {
    unlock: unlock,
    playBgm: playBgm,
    stopBgm: stopBgm,
    pauseBgm: pauseBgm,
    resumeBgm: resumeBgm,
    setMuted: function (v) {
      muted = v;
      if (_bgm) _bgm.volume = v ? 0 : 0.42;
    },
    isMuted: function () {
      return muted;
    },
    isPlaying: function () {
      return _bgmPlaying;
    },
    keyPress: function () {
      _tone(800 + Math.random() * 200, "square", 0.04, 0.07);
    },
    keyCorrect: function () {
      _tone(1200, "sine", 0.06, 0.1);
    },
    keyError: function () {
      _tone(200, "sawtooth", 0.12, 0.14);
      _noise(0.08, 0.07);
    },
    wordComplete: function () {
      _tone(800, "sine", 0.05, 0.18);
      setTimeout(function () {
        _tone(1200, "sine", 0.05, 0.14);
      }, 60);
      setTimeout(function () {
        _tone(1600, "sine", 0.05, 0.1);
      }, 120);
    },
    hit: function () {
      _tone(400, "sawtooth", 0.08, 0.2);
      _noise(0.06, 0.05);
    },
    playerHit: function () {
      _tone(150, "sawtooth", 0.2, 0.28);
      _noise(0.15, 0.1);
    },
    comboUp: function (c) {
      _tone(600 + c * 40, "sine", 0.05, 0.18);
    },
    overdrive: function () {
      for (var i = 0; i < 5; i++)
        (function (i) {
          setTimeout(function () {
            _tone(400 + i * 200, "sawtooth", 0.1, 0.14);
          }, i * 40);
        })(i);
    },
    freeze: function () {
      _tone(2000, "sine", 0.3, 0.18);
      _tone(1800, "sine", 0.3, 0.18);
    },
    burn: function () {
      _noise(0.2, 0.14);
      _tone(200, "sawtooth", 0.2, 0.18);
    },
    victory: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () {
          _tone(f, "sine", 0.2, 0.22);
        }, i * 100);
      });
    },
    defeat: function () {
      [400, 300, 200, 150].forEach(function (f, i) {
        setTimeout(function () {
          _tone(f, "sawtooth", 0.25, 0.28);
        }, i * 150);
      });
    },
  };
})();
