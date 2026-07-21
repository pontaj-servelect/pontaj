/* ============================================================================
   ServelectRobotPet · Build SRP-1.1
   Mascotă animată (SVG + JS, zero dependențe) pentru aplicația de pontaj.
   ----------------------------------------------------------------------------
   UTILIZARE RAPIDĂ
     <link rel="stylesheet" href="robot-pet.css">
     <script src="robot-pet.js"></script>

     const robot = ServelectRobotPet.mount('#robot', { state: 'idle' });
     robot.setState('syncing');          // schimbă starea
     robot.setEyeTracking(false);        // oprește urmărirea mouse-ului
     robot.setFloatSpeed(1.4);           // multiplicator viteză levitare
     robot.setLightIntensity(0.8);       // multiplicator intensitate lumini
     robot.setSize(320);                 // lățime în px (sau CSS: --tl-size)

   STĂRI DISPONIBILE (setState acceptă și "extra start" / "extraStart" etc.)
     persistente : idle · online · offline · syncing · working · paused
                   success · alert
     evenimente  : start · pause · unpause · finish · extraStart · extraFinish
                   (tranzitorii — rulează o animație scurtă, apoi trec singure
                   în starea următoare, vezi STATE_PRESETS.after / .to)

   OPȚIUNI (al doilea argument la mount / new ServelectRobotPet)
     state            : 'idle'   — starea inițială
     eyeTracking      : true     — urmărește cursorul pe desktop
     floatSpeed       : 1        — multiplicator global viteză levitare
     floatAmplitude   : 1        — multiplicator amplitudine levitare
     lightIntensity   : 1        — multiplicator global lumini
     mobileTapReact   : true     — pe touch, robotul privește spre tap
     respectReducedMotion : true — reduce mișcarea la prefers-reduced-motion
     onStateChange(name)         — callback la fiecare schimbare de stare
                                   (inclusiv tranzițiile automate)

   PERSONALIZARE STĂRI
     ServelectRobotPet.presets este tabelul de configurare. Fiecare stare poate
     suprascrie: accent / face / ring (culori), dim, floatSpeed, floatAmp,
     lightSpeed, lightLevel, browY, browTilt, mouthCurve, mouthWidth, eyeOpen,
     blinkRate, gaze ('follow'|'focus'|'scan'|'drift'|'sleepy'|'center'),
     earMode ('free'|'alt'), pulse ('soft'|'bounce'|'shake'), after + to
     (auto-tranziție). Modificările se aplică la următorul setState().
   ========================================================================== */
(function (global) {
  'use strict';

  let UID = 0;

  /* ---------- utilitare ---------------------------------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, k) => a + (b - a) * k;
  const rand  = (a, b) => a + Math.random() * (b - a);
  /* zgomot organic: sumă de sinusuri defazate — mișcare "vie", nu mecanică */
  const noise = (t, s) =>
    (Math.sin(t * 1.7 + s) + Math.sin(t * 2.9 + s * 1.3 + 1.7) + Math.sin(t * 0.6 + s * 2.1 + 4.2)) / 3;

  /* ---------- geometrie de bază (coordonate în viewBox 520 × 500) ---------- */
  const EYE_L = { x: 191, y: 220 };
  const EYE_R = { x: 336, y: 220 };
  const PUPIL_MAX_X = 11;      // cursa maximă a pupilei în interiorul ochiului
  const PUPIL_MAX_Y = 8;
  const MOUTH = { x: 261, y: 251 };
  const FLOAT_AMP = 7;         // amplitudinea levitării, în unități viewBox
  const FLOAT_W   = 1.9;       // pulsația levitării (rad/s) — perioadă ≈ 3.3s

  /* ---------- presetări de stare ------------------------------------------- */
  const BASE_STATE = {
    accent: '#3BD6CC', face: '#A7EFE6', ring: '#CFF5EF',
    dim: 1, floatSpeed: 1, floatAmp: 1, lightSpeed: 1, lightLevel: 1,
    browY: 0, browTilt: 0, mouthCurve: 16, mouthWidth: 25,
    eyeOpen: 1, blinkRate: 1, gaze: 'follow', earMode: 'free',
    pulse: null, after: null, to: null
  };

  const STATE_PRESETS = {
    idle:    {},
    online:  { pulse: 'soft' },
    offline: { accent: '#93A2B1', face: '#8798A4', ring: '#93A4B0',
               dim: .5, floatSpeed: .55, floatAmp: .6, lightSpeed: .5,
               browY: 3, browTilt: -5, mouthCurve: 3, mouthWidth: 22,
               eyeOpen: .82, blinkRate: .55, gaze: 'sleepy' },
    syncing: { accent: '#3FC6F2', face: '#9BE2F5', ring: '#C9EDF8',
               lightSpeed: 2.3, earMode: 'alt', gaze: 'scan',
               mouthCurve: 10, floatSpeed: 1.1 },
    working: { lightSpeed: 1.6, floatSpeed: 1.25, browY: 1.2, browTilt: 3,
               mouthCurve: 13, gaze: 'focus' },
    extra:   { accent: '#8B6BF2', face: '#C8BCFF', ring: '#DDD6FF',
               lightSpeed: 1.85, floatSpeed: 1.15, browY: -1,
               browTilt: 2, mouthCurve: 17, gaze: 'focus' },
    paused:  { dim: .72, floatSpeed: .6, floatAmp: .75, lightSpeed: .55,
               mouthCurve: 8, blinkRate: .7, eyeOpen: .93, browTilt: -2,
               gaze: 'drift' },
    success: { accent: '#35D9A2', face: '#93F2CE', ring: '#BFF7E3',
               mouthCurve: 22, mouthWidth: 30, browY: -3, eyeOpen: .9,
               pulse: 'bounce' },
    alert:   { accent: '#F5A93B', face: '#FFD289', ring: '#FFDFA8',
               lightSpeed: 2.6, browY: 1.5, browTilt: 9,
               mouthCurve: 1, mouthWidth: 20, blinkRate: 1.6,
               gaze: 'center', pulse: 'shake' },

    /* evenimente de pontaj — tranzitorii */
    start:       { lightSpeed: 1.8, browY: -2, mouthCurve: 18,
                   pulse: 'bounce', after: 1500, to: 'working' },
    pause:       { alias: 'paused' },
    unpause:     { pulse: 'soft', after: 900, to: 'working' },
    finish:      { accent: '#35D9A2', face: '#93F2CE', ring: '#BFF7E3',
                   mouthCurve: 22, mouthWidth: 30, browY: -3,
                   pulse: 'bounce', after: 2200, to: 'idle' },
    extrastart:  { accent: '#6E6EF7', face: '#B9BCFF', ring: '#CFD1FF',
                   lightSpeed: 1.9, mouthCurve: 18, browY: -2,
                   pulse: 'bounce', after: 1500, to: 'extra' },
    extrafinish: { accent: '#6E6EF7', face: '#B9BCFF', ring: '#CFD1FF',
                   mouthCurve: 22, mouthWidth: 30, browY: -3,
                   pulse: 'bounce', after: 2200, to: 'idle' }
  };

  const normalizeState = (name) => String(name || '').toLowerCase().replace(/[^a-z]/g, '');

  /* ---------- șablonul SVG (robotul reconstruit vectorial) ----------------- */
  function svgTemplate(u) {
    return `
<svg class="tl-svg" viewBox="0 0 520 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Asistentul animat SERVELECT">
  <title>Asistentul animat SERVELECT</title>
  <defs>
    <linearGradient id="gHead${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".62" stop-color="#F7FAFC"/><stop offset="1" stop-color="#E8EEF4"/>
    </linearGradient>
    <linearGradient id="gEar${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F5F8FB"/><stop offset="1" stop-color="#DEE6EE"/>
    </linearGradient>
    <radialGradient id="gScreen${u}" cx=".5" cy=".42" r=".78">
      <stop offset="0" stop-color="#2B3340"/><stop offset=".72" stop-color="#232A36"/><stop offset="1" stop-color="#1C2330"/>
    </radialGradient>
    <linearGradient id="gNeck${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3D4653"/><stop offset=".5" stop-color="#667082"/><stop offset="1" stop-color="#3D4653"/>
    </linearGradient>
    <linearGradient id="gBase${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F1F6F9"/><stop offset="1" stop-color="#DDE6EE"/>
    </linearGradient>
    <radialGradient id="gPupil${u}" cx=".5" cy=".42" r=".7">
      <stop offset="0" stop-color="#1A2029"/><stop offset="1" stop-color="#0D121A"/>
    </radialGradient>
    <radialGradient id="gShadow${u}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#55C8C1" stop-opacity=".55"/>
      <stop offset=".68" stop-color="#55C8C1" stop-opacity=".2"/>
      <stop offset="1" stop-color="#55C8C1" stop-opacity="0"/>
    </radialGradient>
    <filter id="fGlow${u}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.1" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="fBlur6${u}" x="-140%" y="-140%" width="380%" height="380%"><feGaussianBlur stdDeviation="6"/></filter>
    <clipPath id="cEyeL${u}"><circle cx="${EYE_L.x}" cy="${EYE_L.y}" r="33"/></clipPath>
    <clipPath id="cEyeR${u}"><circle cx="${EYE_R.x}" cy="${EYE_R.y}" r="33"/></clipPath>
  </defs>

  <!-- umbra de la sol — animată invers față de levitare -->
  <ellipse class="tl-shadow" cx="260" cy="452" rx="100" ry="12" fill="url(#gShadow${u})"/>

  <g class="tl-float">
    <!-- baza plutitoare -->
    <g class="tl-base">
      <ellipse cx="261" cy="378" rx="101" ry="40" fill="url(#gBase${u})"/>
      <ellipse cx="261" cy="344" rx="46" ry="9" fill="#C7D1DC" opacity=".55"/>
      <path class="tl-line-halo tl-jhalo" d="M 168,371 Q 261,384 354,371" filter="url(#fBlur6${u})" opacity="0"/>
      <path class="tl-line-core tl-jcore" d="M 168,371 Q 261,384 354,371" filter="url(#fGlow${u})"/>
      <rect class="tl-halo tl-jhalo tl-pill-halo" x="245" y="389" width="32" height="10" rx="5" filter="url(#fBlur6${u})" opacity="0"/>
      <rect class="tl-core tl-jcore tl-pill-core" x="245" y="389" width="32" height="10" rx="5" filter="url(#fGlow${u})"/>
    </g>

    <!-- gâtul -->
    <rect x="234" y="316" width="56" height="34" rx="10" fill="url(#gNeck${u})"/>

    <g class="tl-head-motion">
    <!-- urechile / pod-urile laterale -->
    <g class="tl-ear tl-ear-l">
      <rect x="62" y="167" width="46" height="108" rx="23" fill="url(#gEar${u})"/>
      <rect class="tl-halo tl-jhalo tl-earlight-halo-l" x="69" y="182" width="10" height="78" rx="5" filter="url(#fBlur6${u})" opacity="0"/>
      <rect class="tl-core tl-jcore tl-earlight-core-l" x="69" y="182" width="10" height="78" rx="5" filter="url(#fGlow${u})"/>
    </g>
    <g class="tl-ear tl-ear-r">
      <rect x="412" y="167" width="46" height="108" rx="23" fill="url(#gEar${u})"/>
      <rect class="tl-halo tl-jhalo tl-earlight-halo-r" x="441" y="182" width="10" height="78" rx="5" filter="url(#fBlur6${u})" opacity="0"/>
      <rect class="tl-core tl-jcore tl-earlight-core-r" x="441" y="182" width="10" height="78" rx="5" filter="url(#fGlow${u})"/>
    </g>

    <!-- capul + ecranul -->
    <g class="tl-head">
      <rect x="100" y="80" width="320" height="252" rx="64" fill="url(#gHead${u})"/>
      <rect x="122" y="112" width="276" height="196" rx="42" fill="none" stroke="#DEE6ED" stroke-width="2.5"/>
      <rect class="tl-screen" x="126" y="116" width="268" height="188" rx="38" fill="url(#gScreen${u})"/>
      <rect class="tl-screen-tint" x="126" y="116" width="268" height="188" rx="38"/>
      <rect class="tl-halo tl-jhalo tl-toplight-halo" x="243" y="92" width="36" height="10" rx="5" filter="url(#fBlur6${u})" opacity="0"/>
      <rect class="tl-core tl-jcore tl-toplight-core" x="243" y="92" width="36" height="10" rx="5" filter="url(#fGlow${u})"/>
    </g>

    <!-- fața -->
    <g class="tl-face">
      <g class="tl-brow tl-brow-l"><path d="M 159,175 Q 188,156 219,169" filter="url(#fGlow${u})"/></g>
      <g class="tl-brow tl-brow-r"><path d="M 303,169 Q 334,156 363,175" filter="url(#fGlow${u})"/></g>

      <g class="tl-eye tl-eye-l">
        <circle class="tl-ring" cx="${EYE_L.x}" cy="${EYE_L.y}" r="40" filter="url(#fGlow${u})"/>
        <circle class="tl-iris" cx="${EYE_L.x}" cy="${EYE_L.y}" r="36"/>
        <path class="tl-iris-rim" d="M 172,243 Q 191,251 210,243"/>
        <g clip-path="url(#cEyeL${u})"><g class="tl-pupil tl-pupil-l">
          <circle cx="${EYE_L.x}" cy="${EYE_L.y}" r="17.5" fill="url(#gPupil${u})"/>
          <ellipse cx="183" cy="208" rx="8.2" ry="6.2" transform="rotate(-18 183 208)" fill="#FFFFFF"/>
          <circle cx="175" cy="219" r="3.1" fill="#FFFFFF" opacity=".95"/>
        </g></g>
      </g>

      <g class="tl-eye tl-eye-r">
        <circle class="tl-ring" cx="${EYE_R.x}" cy="${EYE_R.y}" r="40" filter="url(#fGlow${u})"/>
        <circle class="tl-iris" cx="${EYE_R.x}" cy="${EYE_R.y}" r="36"/>
        <path class="tl-iris-rim" d="M 317,243 Q 336,251 355,243"/>
        <g clip-path="url(#cEyeR${u})"><g class="tl-pupil tl-pupil-r">
          <circle cx="${EYE_R.x}" cy="${EYE_R.y}" r="17.5" fill="url(#gPupil${u})"/>
          <ellipse cx="328" cy="208" rx="8.2" ry="6.2" transform="rotate(-18 328 208)" fill="#FFFFFF"/>
          <circle cx="320" cy="219" r="3.1" fill="#FFFFFF" opacity=".95"/>
        </g></g>
      </g>

      <path class="tl-mouth" d="M 236,251 Q 261,267 286,251" filter="url(#fGlow${u})"/>
    </g>
    </g>
  </g>
</svg>`;
  }

  /* ========================================================================
     Clasa componentei
     ====================================================================== */
  class ServelectRobotPet {
    constructor(target, options) {
      const host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) throw new Error('ServelectRobotPet: containerul nu a fost găsit.');

      this.opt = Object.assign({
        state: 'idle',
        eyeTracking: true,
        floatSpeed: 1,
        floatAmplitude: 1,
        lightIntensity: 1,
        mobileTapReact: true,
        respectReducedMotion: true,
        onStateChange: null
      }, options || {});

      this.uid = ++UID;
      this.element = host;
      host.classList.add('tl-robot');
      host.innerHTML = svgTemplate(this.uid);
      this.svg = host.querySelector('svg');

      /* referințe DOM */
      const q = (s) => host.querySelector(s);
      const qa = (s) => Array.from(host.querySelectorAll(s));
      this.el = {
        float:   q('.tl-float'),
        headMotion: q('.tl-head-motion'),
        face:    q('.tl-face'),
        shadow:  q('.tl-shadow'),
        eyes:    qa('.tl-eye'),
        pupils:  qa('.tl-pupil'),
        browL:   q('.tl-brow-l'),
        browR:   q('.tl-brow-r'),
        mouth:   q('.tl-mouth'),
        topCore: q('.tl-toplight-core'),   topHalo: q('.tl-toplight-halo'),
        earCoreL: q('.tl-earlight-core-l'), earHaloL: q('.tl-earlight-halo-l'),
        earCoreR: q('.tl-earlight-core-r'), earHaloR: q('.tl-earlight-halo-r'),
        lineCore: q('.tl-line-core'),       lineHalo: q('.tl-line-halo'),
        pillCore: q('.tl-pill-core'),       pillHalo: q('.tl-pill-halo')
      };

      /* runtime */
      this.isTouch = global.matchMedia && global.matchMedia('(hover: none)').matches;
      this._mqReduce = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
      this._reduced = !!(this.opt.respectReducedMotion && this._mqReduce && this._mqReduce.matches);

      this.p = Object.assign({}, BASE_STATE);       // parametri animați (curenți)
      this.pt = Object.assign({}, BASE_STATE);      // parametri țintă (din stare)
      this._phase = rand(0, Math.PI * 2);           // faza levitării
      this._t = 0;
      this._lastT = null;
      this._pointer = { nx: 0, ny: 0, lastMove: -1e9, holdUntil: 0 };
      this._gaze = { x: 0, y: 0, tx: 0, ty: 0, sacAt: 0 };
      this._tilt = 0;
      this._blink = { at: performance.now() + rand(1200, 3000), t0: null, dbl: false };
      this._pulse = null;
      this._happyUntil = 0;
      this._autoTimer = null;
      this._raf = null;
      this._visible = true;
      this._pageVisible = !document.hidden;
      this._eyeTracking = !!this.opt.eyeTracking;
      this._destroyed = false;

      this._bind();
      this.setState(this.opt.state);
      this._start();
    }

    /* ---------- API public ------------------------------------------------ */
    setState(name) {
      let key = normalizeState(name);
      if (!(key in STATE_PRESETS)) { console.warn('ServelectRobotPet: stare necunoscută:', name); return this; }
      if (STATE_PRESETS[key].alias) key = STATE_PRESETS[key].alias;
      if (this._state === key) return this;

      const preset = STATE_PRESETS[key];
      this.pt = Object.assign({}, BASE_STATE, preset);
      this._state = key;
      this.element.dataset.state = key;

      /* culorile trec prin variabile CSS → tranziție lină din CSS */
      const st = this.element.style;
      st.setProperty('--tl-accent', this.pt.accent);
      st.setProperty('--tl-face', this.pt.face);
      st.setProperty('--tl-ring', this.pt.ring);

      if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
      if (this.pt.pulse && !this._reduced) this.pulse(this.pt.pulse);
      if (this.pt.pulse === 'bounce') this._blink.at = performance.now() + 260; // clipire scurtă la sărituri
      if (this.pt.after && this.pt.to) {
        this._autoTimer = setTimeout(() => this.setState(this.pt.to), this.pt.after);
      }
      if (typeof this.opt.onStateChange === 'function') this.opt.onStateChange(key, this);
      return this;
    }
    getState() { return this._state; }

    setEyeTracking(on) { this._eyeTracking = !!on; return this; }
    setFloatSpeed(mult) { this.opt.floatSpeed = Number.isFinite(+mult) ? +mult : 1; return this; }
    setFloatAmplitude(mult) { this.opt.floatAmplitude = Number.isFinite(+mult) ? +mult : 1; return this; }
    setLightIntensity(mult) { this.opt.lightIntensity = Number.isFinite(+mult) ? +mult : 1; return this; }
    setSize(px) { this.element.style.setProperty('--tl-size', px + 'px'); return this; }

    /* impuls fizic manual: 'soft' | 'bounce' | 'shake' | 'tap' */
    pulse(type) { this._pulse = { type: type, t0: performance.now() }; return this; }

    destroy() {
      this._destroyed = true;
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._autoTimer) clearTimeout(this._autoTimer);
      this._unbinders.forEach((f) => f());
      if (this._io) this._io.disconnect();
      this.element.innerHTML = '';
      this.element.classList.remove('tl-robot');
    }

    /* ---------- evenimente ------------------------------------------------ */
    _bind() {
      const u = (this._unbinders = []);
      const on = (tgt, ev, fn, opts) => { tgt.addEventListener(ev, fn, opts); u.push(() => tgt.removeEventListener(ev, fn, opts)); };

      /* urmărirea cursorului (desktop) */
      on(global, 'pointermove', (e) => {
        if (this.isTouch) return;
        this._updatePointer(e.clientX, e.clientY);
        this._pointer.lastMove = performance.now();
      }, { passive: true });

      /* tap pe mobile → privește spre punctul atins; tap pe robot → reacție */
      on(global, 'pointerdown', (e) => {
        const onRobot = this.element.contains(e.target);
        if (this.isTouch && this.opt.mobileTapReact) {
          this._updatePointer(e.clientX, e.clientY);
          this._pointer.lastMove = performance.now();
          this._pointer.holdUntil = performance.now() + 2200;
        }
        if (onRobot && !this._reduced) {
          this.pulse('tap');
          this._happyUntil = performance.now() + 720;
          this._blink.at = performance.now() + 120;
        }
      }, { passive: true });

      on(this.element, 'keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!this._reduced) this.pulse('tap');
        this._happyUntil = performance.now() + 720;
        this._blink.at = performance.now() + 120;
      });

      /* pauză când tab-ul e ascuns sau robotul iese din viewport */
      on(document, 'visibilitychange', () => {
        this._pageVisible = !document.hidden;
        this._pageVisible && this._visible ? this._start() : this._stop();
      });
      if ('IntersectionObserver' in global) {
        this._io = new IntersectionObserver((entries) => {
          this._visible = entries[0].isIntersecting;
          this._visible && this._pageVisible ? this._start() : this._stop();
        }, { threshold: 0.02 });
        this._io.observe(this.element);
      }

      if (this._mqReduce) {
        const fn = () => { this._reduced = !!(this.opt.respectReducedMotion && this._mqReduce.matches); };
        on(this._mqReduce, 'change', fn);
      }
    }

    _updatePointer(px, py) {
      const r = this.svg.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width * (261 / 520);
      const cy = r.top + r.height * (220 / 500);
      let nx = (px - cx) / (r.width * 0.75);
      let ny = (py - cy) / (r.width * 0.75);
      const len = Math.hypot(nx, ny);
      if (len > 1) { nx /= len; ny /= len; }
      this._pointer.nx = nx;
      this._pointer.ny = ny;
    }

    /* ---------- bucla de animație ---------------------------------------- */
    _start() {
      if (this._raf || this._destroyed) return;
      this._lastT = null;
      const step = (now) => { this._raf = null; this._frame(now); if (!this._destroyed && this._pageVisible && this._visible) this._raf = requestAnimationFrame(step); };
      this._raf = requestAnimationFrame(step);
    }
    _stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

    _frame(now) {
      if (this._lastT === null) this._lastT = now;
      const dt = clamp((now - this._lastT) / 1000, 0, 0.05);
      this._lastT = now;
      this._t += dt;
      const t = this._t;
      const p = this.p, pt = this.pt;

      /* 1 · interpolarea lină a parametrilor de stare (fără salturi) */
      const k = 1 - Math.exp(-dt * 4.5);
      for (const key of ['dim','floatSpeed','floatAmp','lightSpeed','lightLevel','browY','browTilt','mouthCurve','mouthWidth','eyeOpen','blinkRate']) {
        p[key] = lerp(p[key], pt[key], k);
      }
      p.gaze = pt.gaze; p.earMode = pt.earMode;

      /* 2 · levitare + impulsuri */
      const motion = this._reduced ? 0.35 : 1;
      this._phase += dt * FLOAT_W * p.floatSpeed * this.opt.floatSpeed;
      const amp = FLOAT_AMP * p.floatAmp * this.opt.floatAmplitude * motion;
      let fy = Math.sin(this._phase) * amp;
      let fx = Math.sin(this._phase * 0.5 + 1.2) * 1.6 * motion;
      let boost = 1;
      if (this._pulse) {
        const ptl = (now - this._pulse.t0) / 1000;
        if (ptl > 1.8) this._pulse = null;
        else {
          const e3 = Math.exp(-3.2 * ptl);
          switch (this._pulse.type) {
            case 'bounce': fy += -16 * e3 * Math.sin(9 * ptl);  boost = 1 + 0.9 * Math.exp(-3 * ptl); break;
            case 'soft':   fy += -6  * e3 * Math.sin(8 * ptl);  boost = 1 + 0.4 * Math.exp(-3 * ptl); break;
            case 'tap':    fy += -8  * Math.exp(-4 * ptl) * Math.sin(11 * ptl); boost = 1 + 0.5 * Math.exp(-3.5 * ptl); break;
            case 'shake':  fx += 3.2 * Math.exp(-3.5 * ptl) * Math.sin(26 * ptl); boost = 1 + 0.5 * Math.exp(-3 * ptl); break;
          }
        }
      }

      /* 3 · privirea */
      this._updateGaze(now, t, dt);
      const gz = this._gaze;

      /* înclinare fină a capului, separată de levitația corpului */
      const pointerFresh = !this.isTouch && this._eyeTracking && now - this._pointer.lastMove < 7000;
      const tapFresh = this.isTouch && now < this._pointer.holdUntil;
      const tiltTarget = (pointerFresh || tapFresh)
        ? this._pointer.nx * 2.2 * motion
        : noise(t * 0.34, 77) * 0.75 * motion;
      this._tilt = lerp(this._tilt, tiltTarget, 1 - Math.exp(-dt * 3));
      const tilt = this._tilt + Math.sin(t * 0.45) * 0.32 * motion;

      this.el.float.style.transform = `translate(${fx.toFixed(2)}px, ${fy.toFixed(2)}px)`;
      this.el.headMotion.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      this.el.face.style.transform = `translate(${(gz.x * 0.35).toFixed(2)}px, ${(gz.y * 0.3).toFixed(2)}px)`;

      /* 4 · umbra — invers față de levitare: sus → mică & difuză, jos → lată */
      const h = amp > 0.01 ? clamp(fy / amp, -1, 1) : 0;
      const shO = (0.52 + 0.22 * h) * (0.5 + 0.5 * p.dim);
      this.el.shadow.style.transform = `translateX(${(-fx * 0.4).toFixed(2)}px) scale(${(0.92 + 0.1 * h).toFixed(3)}, ${(0.9 + 0.12 * h).toFixed(3)})`;
      this.el.shadow.style.opacity = shO.toFixed(3);
      this.el.shadow.style.filter = `blur(${(2.1 + (1 - h) * 1.8).toFixed(2)}px)`;

      /* 5 · clipire organică (intervale variabile + clipire dublă ocazională) */
      let blinkEnv = 0;
      const b = this._blink;
      if (b.t0 !== null) {
        const bt = (now - b.t0) / 260;
        if (bt >= 1) {
          b.t0 = null;
          if (b.dbl) { b.dbl = false; b.at = now + 130; }   // clipire dublă
          else b.at = now + rand(2600, 7200) / Math.max(0.2, p.blinkRate);
        } else blinkEnv = Math.sin(Math.PI * clamp(bt, 0, 1));
      } else if (now >= b.at) {
        b.t0 = now;
        b.dbl = Math.random() < 0.16;
      }
      const eyeScaleY = clamp(p.eyeOpen * (1 - blinkEnv * 0.93), 0.05, 1);
      for (const eye of this.el.eyes) eye.style.transform = `scaleY(${eyeScaleY.toFixed(3)})`;

      /* 6 · pupile: țintă + micro-jitter, limitate în elipsa ochiului */
      const jx = noise(t * 1.3, 11) * 0.8 * motion;
      const jy = noise(t * 1.1, 23) * 0.6 * motion;
      let px = gz.x + jx, py = gz.y + jy;
      const pl = Math.hypot(px / PUPIL_MAX_X, py / PUPIL_MAX_Y);
      if (pl > 1) { px /= pl; py /= pl; }
      for (const pu of this.el.pupils) pu.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;

      /* 7 · sprâncene + gură — micro-expresii */
      const dip = blinkEnv * 2.5;
      const bl = p.browY + dip + noise(t * 0.8, 3) * 1.1 * motion;
      const br = p.browY + dip + noise(t * 0.8, 41) * 1.1 * motion;
      this.el.browL.style.transform = `translateY(${bl.toFixed(2)}px) rotate(${p.browTilt.toFixed(2)}deg)`;
      this.el.browR.style.transform = `translateY(${br.toFixed(2)}px) rotate(${(-p.browTilt).toFixed(2)}deg)`;

      const happy = now < this._happyUntil ? Math.sin(Math.PI * clamp((this._happyUntil - now) / 720, 0, 1)) : 0;
      const mc = p.mouthCurve + happy * 8 + noise(t * 0.7, 9) * 1.4 * motion;
      const mw = p.mouthWidth + happy * 4 + noise(t * 0.5, 5) * 1.2 * motion;
      this.el.mouth.setAttribute('d',
        `M ${(MOUTH.x - mw).toFixed(1)},${MOUTH.y} Q ${MOUTH.x},${(MOUTH.y + mc).toFixed(1)} ${(MOUTH.x + mw).toFixed(1)},${MOUTH.y}`);

      /* 8 · luminile — patru surse cu ritmuri independente dar coerente */
      const ls = p.lightSpeed;
      const L = clamp(p.lightLevel * this.opt.lightIntensity, 0, 1.4) * p.dim * boost;

      const vTop = this._reduced ? 0.72 : 0.5 + 0.5 * Math.sin(t * 1.05 * ls); // puls calm, principal
      let vEL, vER;
      if (this._reduced) {
        vEL = 0.66; vER = 0.74;
      } else if (p.earMode === 'alt') {                                       // syncing: alternanță stânga/dreapta
        vEL = 0.5 + 0.48 * Math.sin(t * 2.2 * ls);
        vER = 0.5 + 0.48 * Math.sin(t * 2.2 * ls + Math.PI);
      } else {                                                                // ritmuri apropiate → intră și ies din sincron
        vEL = 0.5 + 0.42 * Math.sin(t * 1.52 * ls + 0.7) + 0.08 * noise(t * 0.9, 31);
        vER = 0.5 + 0.42 * Math.sin(t * 1.41 * ls + 2.3) + 0.08 * noise(t * 0.9, 57);
      }
      const vBot = this._reduced ? 0.7 : 0.5 + 0.32 * Math.sin(this._phase - 0.9) + 0.12 * Math.sin(t * 4.3 + 1); // legată de levitare + shimmer

      this._light(this.el.topCore, this.el.topHalo, vTop, L, 0.85);
      this._light(this.el.earCoreL, this.el.earHaloL, vEL, L, 1);
      this._light(this.el.earCoreR, this.el.earHaloR, vER, L, 1);
      this._light(this.el.lineCore, this.el.lineHalo, vBot, L, 0.9);
      this._light(this.el.pillCore, this.el.pillHalo, clamp(vBot + 0.1, 0, 1.2), L, 0.9);
    }

    _light(core, halo, v, L, haloK) {
      v = clamp(v, 0, 1.2);
      core.style.opacity = clamp((0.42 + 0.58 * v) * L, 0.06, 1).toFixed(3);
      halo.style.opacity = clamp((0.1 + 0.6 * v) * L * haloK, 0, 1).toFixed(3);
    }

    /* privirea: follow / focus / scan / drift / sleepy / center + saccade idle */
    _updateGaze(now, t, dt) {
      const g = this._gaze;
      const mode = this.p.gaze;
      const idleFor = now - this._pointer.lastMove;
      const pointerLive = !this.isTouch && this._eyeTracking && idleFor < 7000;
      const tapHold = this.isTouch && now < this._pointer.holdUntil;

      let tx, ty;
      if (mode === 'scan') {
        tx = Math.sin(t * 1.5) * 10; ty = Math.sin(t * 3.0) * 3;
      } else if (mode === 'center') {
        tx = 0; ty = 0;
      } else if ((mode === 'follow' || mode === 'focus') && (pointerLive || tapHold)) {
        const s = mode === 'focus' ? 0.65 : 1;
        tx = this._pointer.nx * PUPIL_MAX_X * s;
        ty = this._pointer.ny * PUPIL_MAX_Y * s;
      } else {
        /* saccade: privirea "vie" când nu există cursor (mobil / idle lung) */
        if (now >= g.sacAt) {
          const slow = mode === 'sleepy' || mode === 'drift';
          const r = Math.pow(Math.random(), 0.7) * (slow ? 0.5 : 0.9);
          const a = rand(0, Math.PI * 2);
          g.tx = Math.cos(a) * r * PUPIL_MAX_X;
          g.ty = Math.sin(a) * r * PUPIL_MAX_Y + (mode === 'sleepy' ? 4 : 0);
          g.sacAt = now + rand(1400, 4200) * (slow ? 1.6 : 1);
        }
        tx = g.tx; ty = g.ty;
      }
      const ke = 1 - Math.exp(-dt * (mode === 'sleepy' || mode === 'drift' ? 3 : 7));
      g.x = lerp(g.x, tx, ke);
      g.y = lerp(g.y, ty, ke);
    }
  }

  /* helper static */
  ServelectRobotPet.mount = (target, options) => new ServelectRobotPet(target, options);
  ServelectRobotPet.presets = STATE_PRESETS;
  ServelectRobotPet.version = 'SRP-1.1';

  if (typeof module !== 'undefined' && module.exports) module.exports = ServelectRobotPet;
  global.ServelectRobotPet = ServelectRobotPet;
})(typeof window !== 'undefined' ? window : this);
