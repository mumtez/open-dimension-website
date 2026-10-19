(function () {
  'use strict';
  var root = document.documentElement;
  var motion = root.classList.contains('motion');
  var reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var TAU = Math.PI * 2;

  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };
  var damp = function (dt, rate) { return 1 - Math.exp(-dt * rate); };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ================= DOM references ================= */
  var nav = $('#nav'), linksEl = $('#links');
  var links = $$('[data-link]', linksEl);
  var heroInner = $('.hero-inner');
  var tessEl = $('#tess'), track = $('#track'), schematic = $('#schematic'), ringsEl = $('#rings'), contactArt = $('#contactArt'), lensEl = $('.lens');
  var labs = $$('.lab', schematic), rl = $('.rl', schematic);
  var arts = $$('.art');
  var cards = $$('.card');
  var slots = $$('.slot');
  var hud = { x: $('#hx'), y: $('#hy'), s: $('#hs'), t: $('#ht') };

  var scenes = $$('[data-scene]').map(function (el) { return { el: el, kind: el.dataset.scene, theme: el.dataset.theme, top: 0, h: 0, p: 0 }; });
  var sceneBy = {}; scenes.forEach(function (s) { sceneBy[s.kind] = s; });

  // Depth layers: positive depth moves faster than the scroll (front), negative slower (back).
  var layers = $$('[data-depth]').map(function (el) {
    var host = el.closest('[data-scene]');
    return { el: el, s: parseFloat(el.dataset.depth), scene: sceneBy[host.dataset.scene] };
  });

  // Split the vision statement into words that light up with scroll.
  var words = [];
  $$('[data-reveal]').forEach(function (el) {
    el.innerHTML = el.textContent.trim().split(/\s+/).map(function (w) { return '<span class="word">' + w + '</span>'; }).join(' ');
    words = words.concat($$('.word', el));
  });

  // Fade-ins for elements that aren't scroll-pinned.
  if (motion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.25 });
    $$('[data-fade]').forEach(function (el) { io.observe(el); });
  } else { $$('[data-fade]').forEach(function (el) { el.classList.add('in'); }); }

  /* ================= Pointer: spring-smoothed position, speed → "energy", ripples ================= */
  var pointer = { x: 0, y: 0, sx: 0, sy: 0, px: 0, py: 0, mx: 0, my: 0, vx: 0, vy: 0, active: false, lastX: 0, lastY: 0, acc: 0, energy: 0 };
  var ripples = [], lastRipple = 0;
  function spawnRipple(x, y, s) { ripples.push({ x: x, y: y, t: performance.now(), s: s }); if (ripples.length > 9) ripples.shift(); }
  window.addEventListener('pointermove', function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.px = e.clientX; pointer.py = e.clientY;
    if (!pointer.active) { pointer.active = true; pointer.mx = pointer.lastX = e.clientX; pointer.my = pointer.lastY = e.clientY; }
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) { if (motion) spawnRipple(e.clientX, e.clientY, 1.7); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () { pointer.active = false; });

  /* ================= Layout metrics (no per-frame layout reads) ================= */
  var vw = window.innerWidth, vh = window.innerHeight;
  var trackDistance = 0, slotX0 = [];
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight;
    var sy = window.scrollY;
    scenes.forEach(function (s) { var r = s.el.getBoundingClientRect(); s.top = r.top + sy; s.h = r.height; });
    trackDistance = Math.max(0, track.scrollWidth - vw);
    slotX0 = slots.map(function (s) { return s.offsetLeft + s.offsetWidth / 2; });
    panes.forEach(function (p) {
      var cs = getComputedStyle(p.el).borderRadius;
      p.radiusPct = /%/.test(cs); p.radius = parseFloat(cs) || 0;
    });
    initParticles();
    if (glOK) resizeGL();
  }

  /* ================= Per-frame DOM update (writes only) ================= */
  var state = {
    sp: 0, heroP: 0, heroAlpha: 1, tessScale: 1, tessAlpha: 1, schematicP: 0, cardScale: [1, 1, 1, 1], cardH: [0, 0, 0, 0], cardMag: [[0, 0], [0, 0], [0, 0], [0, 0]],
    lens: { h: 0, dx: 0, dy: 0 }, navLight: 0, theme: 'dark', tessAngle: 0, energy: 0, dy: 0, scrollV: 0,
    rl: { x: 0, y: 0, text: '' }, schemRect: { left: 0, top: 0 }, frame: 0,
    tess: { a: 0, b: 0, c: 0 }, ringA: 0, ringB: 0, wavePhase: 0
  };
  var activeLink = null;

  function moveNav() {
    if (!activeLink) { linksEl.style.setProperty('--po', 0); return; }
    linksEl.style.setProperty('--px', activeLink.parentNode.offsetLeft + 'px');
    linksEl.style.setProperty('--pw', activeLink.parentNode.offsetWidth + 'px');
    linksEl.style.setProperty('--po', 1);
  }

  function update(y) {
    state.sp = y / 1000;
    scenes.forEach(function (s) { s.p = clamp((y - s.top) / Math.max(1, s.h - vh)); });

    hud.s.textContent = ('00' + Math.round(clamp(y / Math.max(1, document.documentElement.scrollHeight - vh)) * 100)).slice(-3);

    if (motion) {
      var hp = clamp(y / vh);
      state.heroP = hp;
      state.heroAlpha = 1 - hp * 1.3;
      heroInner.style.transform = 'translate3d(' + (pointer.sx * 12).toFixed(2) + 'px,' + (-hp * 8 * vh / 100 + pointer.sy * 7).toFixed(2) + 'px,0) scale(' + (1 - hp * 0.16).toFixed(4) + ')';
      heroInner.style.opacity = clamp(state.heroAlpha).toFixed(3);
      state.tessScale = 1 + hp * 0.25;
      state.tessAlpha = 1 - hp * 0.85;

      var vis = sceneBy.vision, prod = sceneBy.products, i;
      if (y > vis.top - vh && y < vis.top + vis.h) {
        var n = words.length, wp = clamp((vis.p - 0.06) / 0.72) * n;
        for (i = 0; i < n; i++) words[i].style.opacity = (0.14 + 0.86 * clamp(wp - i)).toFixed(3);
        state.schematicP = clamp((vis.p - 0.02) / 0.7);
        var lo = clamp((state.schematicP - 0.55) * 3).toFixed(2);
        for (i = 0; i < labs.length; i++) labs[i].style.opacity = lo;
        var L = state.lens;
        lensEl.style.transform = 'translate3d(' + L.dx.toFixed(2) + 'px,' + L.dy.toFixed(2) + 'px,0) scale(' + ((0.85 + vis.p * 0.5) * (1 + 0.05 * L.h)).toFixed(4) + ')';
        // live readout on the schematic's radius vector
        if (!(state.frame & 3) && state.rl.text) {
          rl.textContent = state.rl.text;
          rl.style.transform = 'translate3d(' + (state.rl.x - state.schemRect.left).toFixed(1) + 'px,' + (state.rl.y - state.schemRect.top).toFixed(1) + 'px,0)';
        }
      }
      if (y > prod.top - vh && y < prod.top + prod.h) {
        var tx = -prod.p * trackDistance;
        track.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,0,0)';
        for (i = 0; i < cards.length; i++) {
          var dist = Math.abs((slotX0[i] + tx - vw / 2) / vw);
          var sc = 1 - 0.09 * clamp(dist * 1.5);
          state.cardScale[i] = sc;
          var hv = state.cardH[i], mg = state.cardMag[i];
          cards[i].style.transform = 'translate3d(' + mg[0].toFixed(2) + 'px,' + mg[1].toFixed(2) + 'px,0) scale(' + (sc * (1 + 0.04 * hv)).toFixed(4) + ')';
        }
      }
      for (i = 0; i < layers.length; i++) {
        var l = layers[i], sc2 = l.scene, rt = sc2.top - y, d;
        if (sc2.kind === 'vision' || sc2.kind === 'products') d = (sc2.p - 0.5) * vh;
        else if (sc2.kind === 'hero') d = clamp(y / vh) * vh * 0.6;
        else d = vh / 2 - (rt + sc2.h / 2);
        l.el.style.translate = '0 ' + (-d * l.s).toFixed(2) + 'px';
      }
    }

    var theme = 'dark', current = null;
    for (var j = 0; j < scenes.length; j++) {
      var s = scenes[j], top = s.top - y, bot = top + s.h;
      if (top <= 40 && bot > 40) theme = s.theme;
      if (top <= vh * 0.45 && bot > vh * 0.45) current = s.kind;
    }
    state.theme = theme;
    if (nav.dataset.theme !== theme) nav.dataset.theme = theme;
    var next = null;
    links.forEach(function (a) { var on = a.dataset.link === current; a.classList.toggle('is-active', on); if (on) next = a; });
    if (next !== activeLink) { activeLink = next; moveNav(); }
  }

  /* ================= Wireframe geometry ================= */
  function ring(n, f) { var p = []; for (var i = 0; i <= n; i++) p.push(f(i / n * TAU)); return p; }
  var SH = {
    cube: function () {
      var L = [], v, i, j, k, s, m;
      for (k = 0; k < 2; k++) {
        s = k ? 0.48 : 0.82; v = [];
        for (i = 0; i < 8; i++) v.push([(i & 1 ? 1 : -1) * s, (i & 2 ? 1 : -1) * s, (i & 4 ? 1 : -1) * s]);
        for (i = 0; i < 8; i++) for (j = i + 1; j < 8; j++) {
          var d = i ^ j;
          if (d === 1 || d === 2 || d === 4) { var e = []; for (m = 0; m <= 10; m++) { var t = m / 10; e.push([v[i][0] + (v[j][0] - v[i][0]) * t, v[i][1] + (v[j][1] - v[i][1]) * t, v[i][2] + (v[j][2] - v[i][2]) * t]); } L.push(e); }
        }
      }
      return L;
    },
    sphere: function () {
      var L = [], k, m;
      for (k = -4; k <= 4; k++) (function (y) { var r = Math.sqrt(1 - y * y) * 0.9; L.push(ring(56, function (a) { return [Math.cos(a) * r, y * 0.9, Math.sin(a) * r]; })); })(k / 5);
      for (m = 0; m < 12; m++) (function (b) { L.push(ring(56, function (a) { return [Math.cos(a) * Math.cos(b) * 0.9, Math.sin(a) * 0.9, Math.cos(a) * Math.sin(b) * 0.9]; })); })(m / 12 * Math.PI);
      return L;
    },
    torus: function () {
      var L = [], R = 0.62, r = 0.27, u, v;
      for (u = 0; u < 28; u++) (function (a) { L.push(ring(24, function (t) { return [(R + r * Math.cos(t)) * Math.cos(a), r * Math.sin(t), (R + r * Math.cos(t)) * Math.sin(a)]; })); })(u / 28 * TAU);
      for (v = 0; v < 10; v++) (function (t) { L.push(ring(72, function (a) { return [(R + r * Math.cos(t)) * Math.cos(a), r * Math.sin(t), (R + r * Math.cos(t)) * Math.sin(a)]; })); })(v / 10 * TAU);
      return L;
    },
    wave: function () {
      var L = [], N = 19, i, j, row, col;
      for (i = 0; i < N; i++) {
        row = []; col = [];
        for (j = 0; j < N; j++) {
          var x = i / (N - 1) * 2 - 1, y = j / (N - 1) * 2 - 1;
          row.push([x * 0.95, 0, y * 0.95]); col.push([y * 0.95, 0, x * 0.95]);
        }
        L.push(row, col);
      }
      return L;
    }
  };
  var shapeCache = {};
  function shape(name) { return shapeCache[name] || (shapeCache[name] = SH[name]()); }
  function waveStep(lines, phase, amp) {
    for (var i = 0; i < lines.length; i++) for (var j = 0; j < lines[i].length; j++) {
      var p = lines[i][j], d = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      p[1] = Math.sin(d * 6 - phase) * amp * (1 - d * 0.4) + Math.sin(p[0] * 3.1 + phase * 0.6) * Math.cos(p[2] * 2.7 - phase * 0.5) * amp * 0.45;
    }
  }

  var T4 = { v: [], e: [] };
  (function () {
    var i, j;
    for (i = 0; i < 16; i++) T4.v.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1), (i & 8 ? 1 : -1)]);
    for (i = 0; i < 16; i++) for (j = i + 1; j < 16; j++) { var d = i ^ j; if (d === 1 || d === 2 || d === 4 || d === 8) T4.e.push([i, j]); }
  })();
  function rot4(p, a, b, ang) { var c = Math.cos(ang), s = Math.sin(ang), x = p[a], y = p[b]; p[a] = x * c - y * s; p[b] = x * s + y * c; }

  /* ================= Flow particles (curl-ish noise field; swirl around the cursor; streak with scroll) ================= */
  var parts = [];
  function initParticles() {
    var n = clamp(Math.round(vw * vh / 2600), 240, 620), i;
    parts = [];
    for (i = 0; i < n; i++) parts.push({ x: Math.random() * vw, y: Math.random() * vh, z: 0.2 + Math.random() * 0.7, s: Math.random() * 40, vx: 0, vy: 0 });
  }
  function stepParticles(t, dt) {
    var en = state.energy, i, p, a, sp, vx, vy, dx, dy, d2, f, d, sw;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      a = Math.sin(p.x * 0.0042 + t * 0.00031 + p.s) + Math.cos(p.y * 0.0037 - t * 0.00023) + Math.sin((p.x + p.y) * 0.0021 + t * 0.00011);
      sp = 14 + 30 * p.z + 150 * en;
      vx = Math.cos(a * 1.7) * sp; vy = Math.sin(a * 1.7) * sp;
      if (pointer.active) {
        dx = p.x - pointer.mx; dy = p.y - pointer.my; d2 = dx * dx + dy * dy;
        f = Math.exp(-d2 / 64800);
        if (f > 0.003) { d = Math.sqrt(d2) + 1; sw = (80 + 460 * en) * f; vx += -dy / d * sw + dx / d * 46 * f; vy += dx / d * sw + dy / d * 46 * f; }
      }
      p.vx = vx; p.vy = vy;
      p.x += vx * dt; p.y += vy * dt - state.dy * p.z;
      if (p.x < -20) p.x += vw + 40; else if (p.x > vw + 20) p.x -= vw + 40;
      if (p.y < -20) p.y += vh + 40; else if (p.y > vh + 20) p.y -= vh + 40;
    }
  }

  /* ================= WebGL2 renderer ================= */
  var glc = $('#gl'), gl = null, glOK = false;
  var P = {}, vaoQuad, vaoLines, lineBuf, fbo, bgTex;
  var MAXSEG = 16000, SEGF = 10;
  var seg = new Float32Array(MAXSEG * SEGF), nseg = 0;
  var ranges = [];
  var S = 1, W = 1, H = 1, quality = 1;   // quality: adaptive render-scale multiplier
  var panes = [];

  var ATTRS = [[0, 2, 0], [1, 2, 8], [2, 4, 16], [3, 2, 32]];
  function setLineBase(first) {
    for (var i = 0; i < ATTRS.length; i++) gl.vertexAttribPointer(ATTRS[i][0], ATTRS[i][1], gl.FLOAT, false, SEGF * 4, first * SEGF * 4 + ATTRS[i][2]);
  }

  var VS_QUAD = '#version 300 es\nuniform vec4 uRect; uniform vec2 uRes; out vec2 vP;\n' +
    'void main(){ vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1)); vec2 p=uRect.xy+c*uRect.zw; vP=p;\n' +
    ' gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }';

  // Background: scene colour + blueprint grid that flows (procedural warp) and lenses around the cursor.
  var FS_BG = '#version 300 es\nprecision highp float; in vec2 vP; out vec4 o;\n' +
    'uniform vec3 uBg; uniform vec3 uGrid; uniform float uOff; uniform vec2 uMaskC; uniform vec2 uMaskR; uniform vec2 uA;\n' +
    'uniform vec2 uMouse; uniform float uMon, uTime, uEn, uTcA; uniform vec3 uTc;\n' +
    'float ln(float v,float st){ float x=abs(fract(v/st-.5)-.5)*st; return 1.-smoothstep(.0,1.15,x); }\n' +
    'void main(){\n' +
    ' vec2 p=vP; p+=vec2(sin(vP.y*.011+uTime*.0006),cos(vP.x*.010-uTime*.0005))*(1.4+2.4*uEn);\n' +
    ' vec2 dm=vP-uMouse; float f=exp(-dot(dm,dm)/88200.)*uMon; p-=dm*f*(.30+.25*uEn);\n' +
    ' float py=p.y-uOff; float g=max(max(ln(p.x,48.),ln(py,48.))*uA.x, max(ln(p.x,192.),ln(py,192.))*uA.y); g*=1.+f*2.4;\n' +
    ' float m=1.-smoothstep(.25,.78,length((vP-uMaskC)/uMaskR)); vec3 c=mix(uBg,uGrid,min(g*m+f*g,1.));\n' +
    ' c=mix(c,uTc,f*uTcA);\n' +
    ' c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.; o=vec4(c,1.); }';

  var VS_LINE = '#version 300 es\nlayout(location=0) in vec2 aA; layout(location=1) in vec2 aB; layout(location=2) in vec4 aC; layout(location=3) in vec2 aW;\n' +
    'uniform vec2 uRes; uniform float uHalf; out float vS; out vec4 vC; out vec2 vW;\n' +
    'void main(){ float t=float(gl_VertexID&1); float side=float((gl_VertexID>>1)&1)*2.-1.;\n' +
    ' vec2 d=aB-aA; float L=length(d); vec2 dir=L>1e-4?d/L:vec2(1.,0.); vec2 n=vec2(-dir.y,dir.x);\n' +
    ' float hw=aW.y>0.?uHalf:aW.x*.5+1.; vec2 p=mix(aA,aB,t)+n*side*hw; vS=side*hw; vC=aC; vW=aW;\n' +
    ' gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }';

  var FS_LINE = '#version 300 es\nprecision highp float; in float vS; in vec4 vC; in vec2 vW; out vec4 o; uniform float uMode;\n' +
    'void main(){ float v=abs(vS); float core=1.-smoothstep(vW.x*.5-.55,vW.x*.5+.55,v); float glow=vW.y*exp(-v*v/9.);\n' +
    ' if(uMode<.5){ o=vec4(vC.rgb*(core+glow)*vC.a,0.); } else { float a=core*vC.a; o=vec4(vC.rgb*a,a); } }';

  var FS_BLIT = '#version 300 es\nprecision highp float; out vec4 o; uniform sampler2D uBg;\n' +
    'void main(){ o=texelFetch(uBg, ivec2(gl_FragCoord.xy), 0); }';

  // Glass: refraction through a bevelled slab; rim light and glow follow the cursor.
  var FS_GLASS = '#version 300 es\nprecision highp float; in vec2 vP; out vec4 o;\n' +
    'uniform sampler2D uBg; uniform vec2 uResDev; uniform float uS; uniform vec2 uC; uniform vec2 uH;\n' +
    'uniform float uR, uB, uT, uFrost, uA, uLight, uSh, uHover, uMon; uniform vec2 uMouse; uniform vec4 uTint;\n' +
    'float sd(vec2 p){ vec2 q=abs(p-uC)-uH+uR; return length(max(q,0.))+min(max(q.x,q.y),0.)-uR; }\n' +
    'float hh(float t){ return pow(max(1.-pow(1.-t,4.),0.),.25); }\n' +
    'vec3 bg(vec2 p,float lod){ vec2 uv=vec2(p.x*uS/uResDev.x, 1.-p.y*uS/uResDev.y); return textureLod(uBg,clamp(uv,vec2(.001),vec2(.999)),lod).rgb; }\n' +
    'void main(){\n' +
    ' float d=sd(vP); float cov=clamp(.5-d,0.,1.);\n' +
    ' float sig=clamp(uB*.3+8.,10.,34.); float ds=sd(vP-vec2(0.,min(uH.y*.12+8.,22.))); float sh=exp(-max(ds,0.)/sig)*uSh*mix(1.,.62,uLight)*(1.+.35*uHover);\n' +
    ' if(d>.5&&sh<.004) discard;\n' +
    ' vec3 col=vec3(0.);\n' +
    ' if(cov>0.){\n' +
    '  float depth=max(-d,0.); float t=clamp(depth/uB,0.,1.);\n' +
    '  float e=.03; float slope=(hh(min(t+e,1.))-hh(max(t-e,0.)))/(2.*e); slope=min(slope,10.);\n' +
    '  vec2 g=vec2(sd(vP+vec2(1.,0.))-sd(vP-vec2(1.,0.)), sd(vP+vec2(0.,1.))-sd(vP-vec2(0.,1.))); g=length(g)>1e-4?normalize(g):vec2(0.);\n' +
    '  vec3 n=normalize(vec3(g*(uT/uB)*slope*.6,1.));\n' +
    '  vec3 r=refract(vec3(0.,0.,-1.),n,1./1.5); vec2 disp=r.xy*(uT/max(-r.z,.25)); float m=length(disp); if(m>uB*1.1) disp*=uB*1.1/m;\n' +
    '  vec2 dmv=vP-uMouse; float spot=exp(-dot(dmv,dmv)/(2.*pow(.5*max(uH.x,uH.y),2.)))*uHover*uMon; disp-=dmv*.14*spot;\n' +
    '  vec3 c; c.r=bg(vP+disp*1.05,uFrost).r; c.g=bg(vP+disp,uFrost).g; c.b=bg(vP+disp*.95,uFrost).b;\n' +
    '  c=mix(c,uTint.rgb,uTint.a);\n' +
    '  c*=1.-.10*(1.-t)*(1.-uLight)-.05*(1.-t)*uLight;\n' +
    '  vec2 toM=uMouse-uC; float dm=length(toM); float wL=uMon*(.3+.7*uHover)*smoothstep(1100.,120.,dm);\n' +
    '  vec2 Ld=normalize(mix(vec2(-.55,-.8),toM/max(dm,1.),wL));\n' +
    '  float lit=max(dot(g,Ld),0.); float back=max(dot(g,-Ld),0.);\n' +
    '  float edge=1.-smoothstep(0.,1.7,depth);\n' +
    '  float rim=edge*(.22+.78*lit+.5*back)*(1.+.7*uHover); float sheen=(1.-smoothstep(0.,uB*.9,depth))*(.05+.2*lit+.05*back)*(1.+.8*uHover);\n' +
    '  float gloss=(1.-smoothstep(0.,uH.y*1.1,vP.y-(uC.y-uH.y)))*.05*(1.-.6*uLight);\n' +
    '  c+=vec3(1.)*(rim*mix(.85,.9,uLight)+sheen+gloss+spot*.17*(1.-.5*uLight)); c-=vec3(edge*.13*uLight*(.5+.5*back));\n' +
    '  col=c;\n' +
    ' }\n' +
    ' col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;\n' +
    ' float a=cov+sh*(1.-cov); o=vec4(col*cov,a)*uA; }';

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; return p;
  }
  function U(p, n) { var v = p.u[n]; if (v === undefined) v = p.u[n] = gl.getUniformLocation(p, n); return v; }

  function initGL() {
    if (reduceTransparency) return false;
    try { gl = glc.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return false;
    try {
      P.bg = program(VS_QUAD, FS_BG); P.line = program(VS_LINE, FS_LINE);
      P.blit = program(VS_QUAD, FS_BLIT); P.glass = program(VS_QUAD, FS_GLASS);
    } catch (err) { console.warn('WebGL2 shader error, using CSS fallback:', err.message); return false; }
    vaoQuad = gl.createVertexArray();
    vaoLines = gl.createVertexArray(); gl.bindVertexArray(vaoLines);
    lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, MAXSEG * SEGF * 4, gl.DYNAMIC_DRAW);
    ATTRS.forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribDivisor(a[0], 1); });
    setLineBase(0);
    gl.bindVertexArray(null);
    bgTex = gl.createTexture(); fbo = gl.createFramebuffer();
    glc.addEventListener('webglcontextlost', function (e) { e.preventDefault(); glOK = false; root.classList.remove('gl'); });
    return true;
  }

  function resizeGL() {
    var dpr = window.devicePixelRatio || 1;
    S = Math.min(dpr, 2) * quality;
    var maxPx = 2.8e6; if (vw * vh * S * S > maxPx) S = Math.sqrt(maxPx / (vw * vh));
    W = Math.max(1, Math.round(vw * S)); H = Math.max(1, Math.round(vh * S));
    glc.width = W; glc.height = H;
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bgTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---- segment emission (CSS px). push() bends around the cursor; pushRaw() does not. ---- */
  var WX = 0, WY = 0, WON = false, WS = 0.3;
  function warp(x, y) {
    var dx = x - pointer.mx, dy = y - pointer.my, d2 = dx * dx + dy * dy;
    if (d2 > 324900) { WX = x; WY = y; return; }
    var k = WS * Math.exp(-d2 / 72200);
    WX = x + dx * k; WY = y + dy * k;
  }
  function pushRaw(ax, ay, bx, by, r, g, b, a, w, glow) {
    if (nseg >= MAXSEG) return;
    var o = nseg++ * SEGF;
    seg[o] = ax; seg[o + 1] = ay; seg[o + 2] = bx; seg[o + 3] = by; seg[o + 4] = r; seg[o + 5] = g; seg[o + 6] = b; seg[o + 7] = a; seg[o + 8] = w; seg[o + 9] = glow;
  }
  function push(ax, ay, bx, by, r, g, b, a, w, glow) {
    if (WON) { warp(ax, ay); ax = WX; ay = WY; warp(bx, by); bx = WX; by = WY; }
    pushRaw(ax, ay, bx, by, r, g, b, a, w, glow);
  }
  function emitLine(ax, ay, bx, by, n, c, a, w, glow) {
    var px = ax, py = ay;
    for (var i = 1; i <= n; i++) { var t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; push(px, py, x, y, c[0], c[1], c[2], a, w, glow || 0); px = x; py = y; }
  }
  var tx_ = new Float32Array(256), ty_ = new Float32Array(256), tz_ = new Float32Array(256);
  function emitShape(lines, cx, cy, R, rx, ry, col, alpha, glow, w, nz, tn) {
    var cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry);
    for (var i = 0; i < lines.length; i++) {
      var pl = lines[i], n = pl.length, k;
      for (k = 0; k < n; k++) {
        var p = pl[k], px = p[0], py = p[1], pz = p[2];
        if (nz > 0.002) { var dn = Math.sin(px * 3.1 + tn * 1.7) * Math.sin(py * 2.7 - tn * 1.3) * Math.sin(pz * 3.3 + tn * 1.1), kn = 1 + nz * dn; px *= kn; py *= kn; pz *= kn; }
        var x1 = px * cY + pz * sY, z1 = -px * sY + pz * cY;
        var y2 = py * cX - z1 * sX, z2 = py * sX + z1 * cX, s = 3.4 / (3.4 - z2);
        tx_[k] = cx + x1 * s * R; ty_[k] = cy + y2 * s * R; tz_[k] = z2;
      }
      for (k = 0; k < n - 1; k++) {
        var depth = clamp(0.55 + (tz_[k] + tz_[k + 1]) * 0.25);
        push(tx_[k], ty_[k], tx_[k + 1], ty_[k + 1], col[0], col[1], col[2], (0.22 + depth * 0.7) * alpha, w, glow);
      }
    }
  }
  function emitCircle(cx, cy, r, a0, a1, n, c, a, w, raw) {
    var f = raw ? pushRaw : push;
    var px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
    for (var i = 1; i <= n; i++) {
      var an = a0 + (a1 - a0) * i / n, x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r;
      f(px, py, x, y, c[0], c[1], c[2], a, w, 0); px = x; py = y;
    }
  }
  function emitDashRing(cx, cy, r, dash, gap, rot, c, a, w) {
    var circ = TAU * r, period = dash + gap, cnt = Math.max(1, Math.floor(circ / period)), da = dash / r, step = TAU / cnt;
    for (var i = 0; i < cnt; i++) {
      var a0 = rot + i * step, parts_ = Math.max(1, Math.ceil(dash / 14));
      emitCircle(cx, cy, r, a0, a0 + da, parts_, c, a, w);
    }
  }
  function emitParticles(top, bot, dark) {
    var en = state.energy, tail = 0.05, i, p, vx, vy, ex, ey, len, a, c = dark ? [0.62, 0.86, 1] : [0.12, 0.14, 0.2];
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.y < top - 4 || p.y > bot + 4) continue;
      vx = p.vx; vy = p.vy - (state.dy * p.z) / 0.016;
      ex = vx * tail; ey = vy * tail; len = Math.sqrt(ex * ex + ey * ey);
      if (len > 90) { ex *= 90 / len; ey *= 90 / len; len = 90; } else if (len < 1.6) { ex = ex / (len || 1) * 1.6; ey = ey / (len || 1) * 1.6; }
      a = (0.14 + 0.42 * p.z) * (0.75 + en) * (dark ? 1 : 0.8);
      pushRaw(p.x - ex, p.y - ey, p.x, p.y, c[0], c[1], c[2], Math.min(a, 0.95), 1.1, dark ? 0.22 : 0);
    }
  }
  function emitRipples(t, top, bot, dark) {
    var c = dark ? [0.55, 0.85, 1] : [0.1, 0.45, 0.95];
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i], k = (t - r.t) / 1500;
      if (k < 0 || k >= 1) continue;
      var rad = 14 + ease(k) * 250 * r.s, al = (1 - k) * (1 - k) * 0.55 * Math.min(1, r.s);
      if (r.y + rad < top || r.y - rad > bot) continue;
      emitCircle(r.x, r.y, rad, 0, TAU, Math.max(24, Math.round(rad / 4)), c, al, 1.2, true);
    }
  }
  function emitReticle(top, bot, dark) {
    if (!pointer.active || !finePointer) return;
    var x = pointer.mx, y = pointer.my; if (y < top - 24 || y > bot + 24) return;
    var c = dark ? [0.75, 0.92, 1] : [0.1, 0.12, 0.18], r = 9 + 5 * state.energy, a = 0.85, g = dark ? 0.5 : 0, i;
    emitCircle(x, y, r, 0, TAU, 24, c, a * 0.8, 1.2, true);
    for (i = 0; i < 4; i++) { var an = i * Math.PI / 2; pushRaw(x + Math.cos(an) * (r + 3), y + Math.sin(an) * (r + 3), x + Math.cos(an) * (r + 10), y + Math.sin(an) * (r + 10), c[0], c[1], c[2], a, 1.2, g); }
    pushRaw(x - 1.2, y, x + 1.2, y, c[0], c[1], c[2], a, 2.4, g);
  }

  var rectOf = function (el) { return el.getBoundingClientRect(); };
  var COLS = {};
  function colOf(str) { return COLS[str] || (COLS[str] = str.split(',').map(function (v) { return parseFloat(v) / 255; })); }
  var artH = [0, 0, 0, 0], artAng = [0, 0, 0, 0];

  var t0 = 0;
  function render(t, y, dt) {
    if (!t0) t0 = t;
    var intro = motion ? ease(clamp((t - t0) / 2400)) : 1;
    state.navLight = lerp(state.navLight, state.theme === 'light' ? 1 : 0, damp(dt, 7));
    WON = pointer.active && motion; WS = 0.3 + 0.28 * state.energy;
    var en = state.energy, ink = [0.12, 0.12, 0.14], blue = [0.04, 0.52, 1];
    var sceneRects = scenes.map(function (s) { var top = s.top - y; return { top: top, bot: top + s.h, s: s }; });

    nseg = 0; ranges.length = 0;
    function range(kind, mode, build) {
      var sc = sceneBy[kind], top = sc.top - y, bot = top + sc.h;
      if (bot < -50 || top > vh + 50) return;
      var start = nseg; build(sc, Math.max(0, top), Math.min(vh, bot));
      emitParticles(Math.max(0, top), Math.min(vh, bot), mode === 0);
      emitRipples(t, Math.max(0, top), Math.min(vh, bot), mode === 0);
      emitReticle(Math.max(0, top), Math.min(vh, bot), mode === 0);
      if (nseg > start) ranges.push({ start: start, n: nseg - start, mode: mode, top: top, bot: bot });
    }

    // hero tesseract (additive on dark): pointer speed spins it up
    range('hero', 0, function () {
      var r = rectOf(tessEl);
      if (state.tessAlpha <= 0.01) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = Math.min(r.width, r.height) * 0.2 * state.tessScale * (0.8 + 0.2 * intro);
      var sp = Math.min(state.sp, 1.2), T = state.tess;
      if (motion) { T.a += dt * (0.42 + en * 3.2); T.b += dt * (0.27 + en * 2.0); T.c += dt * 0.19; }
      var axw = T.a + sp * 2.6 + pointer.sx * 0.9, ayz = T.b + sp * 1.8 + pointer.sy * 0.9, azw = T.c;
      state.tessAngle = ((axw * 57.2958) % 360 + 360) % 360;
      var al = state.tessAlpha * intro;
      [[1, [0.39, 0.82, 1], 1.4, 0.55], [0.52, [0.75, 0.59, 1], 1, 0.4]].forEach(function (cfg, layer) {
        var pts = [], dir = layer ? -1 : 1, i;
        for (i = 0; i < 16; i++) {
          var p = T4.v[i].slice();
          rot4(p, 0, 3, axw * dir); rot4(p, 1, 2, ayz * dir); rot4(p, 2, 3, azw); rot4(p, 0, 1, 0.3 + sp);
          var k = 1 / (2.5 - p[3]), q0 = p[0] * k, q1 = p[1] * k, q2 = p[2] * k, s = 3 / (3 - q2 * 1.4);
          pts.push([cx + q0 * s * R * 2.1 * cfg[0], cy + q1 * s * R * 2.1 * cfg[0], q2]);
        }
        T4.e.forEach(function (e) {
          var a = pts[e[0]], b = pts[e[1]], d = clamp(0.5 + (a[2] + b[2]) * 0.9);
          emitLine(a[0], a[1], b[0], b[1], 9, cfg[1], (0.2 + d * 0.8) * al, cfg[2], cfg[3]);
        });
        pts.forEach(function (p) {
          if (WON) { warp(p[0], p[1]); p[0] = WX; p[1] = WY; }
          pushRaw(p[0] - 2.5, p[1], p[0] + 2.5, p[1], cfg[1][0], cfg[1][1], cfg[1][2], 0.95 * al, layer ? 3 : 4.5, 1.2);
        });
      });
    });

    // vision schematic (ink on light): the blue radius follows the cursor
    range('vision', 1, function () {
      var r = rectOf(schematic), k = r.width / 600, cx = r.left + 300 * k, cy = r.top + 300 * k, dp = state.schematicP;
      state.schemRect.left = r.left; state.schemRect.top = r.top;
      var ang = -0.52, dist = 130 * k;
      if (pointer.active && finePointer) { ang = Math.atan2(pointer.my - cy, pointer.mx - cx); dist = Math.hypot(pointer.mx - cx, pointer.my - cy); }
      var L = Math.min(dist, 262 * k), ca = Math.cos(ang), sa = Math.sin(ang);
      state.rl.x = cx + ca * L + 12; state.rl.y = cy + sa * L - 14;
      state.rl.text = 'r = ' + (L / (250 * k)).toFixed(3) + '   θ = ' + ((ang * 57.2958 + 360) % 360).toFixed(1) + '°';
      var items = [
        function (f) { emitCircle(cx, cy, 250 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(110 * f)), ink, 0.85, 1.3); },
        function (f) { emitCircle(cx, cy, 190 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(100 * f)), ink, 0.45, 1.2); },
        function (f) { emitCircle(cx, cy, 130 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(80 * f)), ink, 0.85, 1.3); },
        function (f) { emitCircle(cx, cy, 70 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(60 * f)), ink, 0.85, 1.3); },
        function (f) { emitLine(cx - 280 * k, cy, cx - 280 * k + 560 * k * f, cy, Math.max(1, Math.round(26 * f)), ink, 0.8, 1.2); },
        function (f) { emitLine(cx, cy - 280 * k, cx, cy - 280 * k + 560 * k * f, Math.max(1, Math.round(26 * f)), ink, 0.8, 1.2); },
        function (f) { emitLine(cx - 177 * k, cy - 177 * k, cx - 177 * k + 354 * k * f, cy - 177 * k + 354 * k * f, Math.max(1, Math.round(18 * f)), ink, 0.4, 1.1); },
        function (f) { emitLine(cx + 177 * k, cy - 177 * k, cx + 177 * k - 354 * k * f, cy - 177 * k + 354 * k * f, Math.max(1, Math.round(18 * f)), ink, 0.4, 1.1); },
        function (f) { emitLine(cx, cy, cx + ca * L * f, cy + sa * L * f, 16, blue, 1, 2.2); emitCircle(cx, cy, Math.max(4, L), 0, TAU * f, 90, blue, 0.28, 1.1); },
        function (f) { var yy = cy + 248 * k; emitLine(cx - 250 * k, yy, cx - 250 * k + 500 * k * f, yy, Math.max(1, Math.round(20 * f)), ink, 0.65, 1.2); if (f > 0.02) pushRaw(cx - 250 * k, yy - 8 * k, cx - 250 * k, yy + 8 * k, ink[0], ink[1], ink[2], 0.65, 1.2, 0); if (f > 0.98) pushRaw(cx + 250 * k, yy - 8 * k, cx + 250 * k, yy + 8 * k, ink[0], ink[1], ink[2], 0.65, 1.2, 0); }
      ];
      items.forEach(function (fn, idx) { var f = clamp(dp * 1.6 - idx * 0.07); if (!motion) f = 1; if (f > 0.001) fn(f); });
    });

    // product wireframes (additive on dark): hover makes them spin faster and ripple with noise
    range('products', 0, function () {
      for (var i = 0; i < arts.length; i++) {
        var r = rectOf(arts[i]);
        if (r.right < -200 || r.left > vw + 200) continue;
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var hit = pointer.active && Math.abs(pointer.mx - cx) < r.width * 0.34 && Math.abs(pointer.my - cy) < r.height * 0.34;
        artH[i] += ((hit ? 1 : 0) - artH[i]) * damp(dt, 5);
        var h = artH[i], name = arts[i].dataset.shape, lines = shape(name);
        if (motion) artAng[i] += dt * (0.28 + 1.6 * h + 1.3 * en);
        state.cardH[i] = h;
        var cc = (hit || h > 0.02) ? [clamp((pointer.mx - cx) * 0.06 * h, -9, 9), clamp((pointer.my - cy) * 0.06 * h, -9, 9)] : [0, 0];
        state.cardMag[i] = cc;
        var nz = 0.015 + 0.17 * h + 0.07 * en, tn = (motion ? t : 0) * 0.001;
        if (name === 'wave') { state.wavePhase += dt * (1.6 + en * 3.5 + h * 3) / 4; waveStep(lines, state.wavePhase * 4, 0.2 * (1 + 1.4 * h + 1.2 * en)); }
        var R = Math.min(r.width, r.height) * 0.3 * 1.55 * state.cardScale[i] * (1 + 0.05 * h);
        var rx = name === 'wave' ? -1.0 : 0.45 + Math.sin(artAng[i] * 0.9) * 0.25;
        var ry = (name === 'wave' ? Math.sin(artAng[i] * 0.7) * 0.3 : artAng[i]) + state.sp * 3.2;
        emitShape(lines, cx, cy, R, rx, ry, colOf(arts[i].dataset.color), 0.75 + 0.25 * h, 0.4 + 0.5 * h, 1.2 + 0.6 * h, name === 'wave' ? 0 : nz, tn);
      }
    });

    // studio rings (ink on light): energy spins them; dashes bend around the cursor
    range('studio', 1, function () {
      var r = rectOf(ringsEl), k = r.width / 800, cx = r.left + r.width / 2, cy = r.top + r.height / 2, tm = motion ? t : 0;
      var near = pointer.active ? clamp(1 - Math.hypot(pointer.mx - cx, pointer.my - cy) / 700) : 0;
      if (motion) { state.ringA += dt * (0.07 + en * 1.1 + near * 0.18); state.ringB -= dt * (0.04 + en * 0.7 + near * 0.12); }
      var br = 1 + 0.012 * Math.sin(tm * 0.0009);
      emitDashRing(cx, cy, 380 * k * br, 2 * k, 10 * k, state.ringA * 0.2, ink, 0.45, 1.2);
      emitDashRing(cx, cy, 320 * k * br, 1 * k, 7 * k, state.ringA, ink, 0.5, 1.2);
      emitDashRing(cx, cy, 250 * k * br, 40 * k, 14 * k, state.ringB, ink, 0.45, 1.2);
      emitCircle(cx, cy, 170 * k * br, 0, TAU, 90, ink, 0.4, 1.2);
    });

    // contact wave (additive on dark): amplitude follows pointer/scroll energy
    range('contact', 0, function () {
      var r = rectOf(contactArt), lines = shape('wave'), tm = motion ? t : 0;
      state.wavePhase += dt * (1.6 + en * 3.5) / 4;
      waveStep(lines, state.wavePhase * 4, 0.2 * (1 + 1.3 * en));
      emitShape(lines, r.left + r.width / 2, r.top + r.height * 0.55, Math.min(r.width * 0.42, r.height * 0.9), -1.12, Math.sin(tm * 0.00015) * 0.25, [0.39, 0.82, 1], 0.7, 0.4, 1.2, 0, 0);
    });

    /* ---- pass A: scene backgrounds + lines → bg texture ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.bindVertexArray(vaoQuad);
    gl.useProgram(P.bg);
    gl.uniform2f(U(P.bg, 'uRes'), vw, vh);
    gl.uniform2f(U(P.bg, 'uMouse'), pointer.mx, pointer.my);
    gl.uniform1f(U(P.bg, 'uMon'), pointer.active && finePointer ? 1 : 0);
    gl.uniform1f(U(P.bg, 'uTime'), motion ? t : 0);
    gl.uniform1f(U(P.bg, 'uEn'), motion ? en : 0);
    sceneRects.forEach(function (sr) {
      if (sr.bot < 0 || sr.top > vh) return;
      var s = sr.s, light = s.theme === 'light', pinned = s.kind === 'vision' || s.kind === 'products', hero = s.kind === 'hero';
      var d, depth;
      if (pinned) d = (s.p - 0.5) * vh; else if (hero) d = clamp(y / vh) * vh * 0.6; else d = vh / 2 - (sr.top + s.h / 2);
      depth = hero ? 0.18 : 0.2;
      var off = (pinned || hero ? 0 : sr.top) + (motion ? d * depth : 0);
      var mc = (pinned || hero) ? [vw / 2, vh / 2] : [vw / 2, sr.top + s.h / 2];
      var mh = ((pinned || hero) ? vh * 1.32 : s.h * 1.32) / 2 * 1.4142;
      gl.uniform4f(U(P.bg, 'uRect'), 0, sr.top, vw, s.h);
      gl.uniform3f(U(P.bg, 'uBg'), light ? 0.9608 : 0, light ? 0.9608 : 0, light ? 0.9686 : 0);
      gl.uniform3f(U(P.bg, 'uGrid'), light ? 0 : 1, light ? 0 : 1, light ? 0 : 1);
      gl.uniform2f(U(P.bg, 'uA'), light ? 0.05 : 0.06, light ? 0.11 : 0.13);
      gl.uniform3f(U(P.bg, 'uTc'), light ? 0.04 : 0.39, light ? 0.52 : 0.82, 1);
      gl.uniform1f(U(P.bg, 'uTcA'), light ? 0.07 : 0.11);
      gl.uniform1f(U(P.bg, 'uOff'), off);
      gl.uniform2f(U(P.bg, 'uMaskC'), mc[0], mc[1]);
      gl.uniform2f(U(P.bg, 'uMaskR'), vw / 2 * 1.4142, mh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    if (nseg) {
      gl.bindVertexArray(vaoLines);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, seg.subarray(0, nseg * SEGF));
      gl.useProgram(P.line);
      gl.uniform2f(U(P.line, 'uRes'), vw, vh); gl.uniform1f(U(P.line, 'uHalf'), 7);
      gl.enable(gl.BLEND); gl.enable(gl.SCISSOR_TEST);
      ranges.forEach(function (rg) {
        gl.blendFunc(gl.ONE, rg.mode === 0 ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(U(P.line, 'uMode'), rg.mode);
        var y0 = Math.max(0, rg.top), y1 = Math.min(vh, rg.bot);
        gl.scissor(0, Math.floor((vh - y1) * S), W, Math.max(0, Math.ceil((y1 - y0) * S)));
        setLineBase(rg.start);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rg.n);
      });
      gl.disable(gl.SCISSOR_TEST);
    }

    gl.bindTexture(gl.TEXTURE_2D, bgTex); gl.generateMipmap(gl.TEXTURE_2D);

    /* ---- pass B: blit, then glass panes ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(vaoQuad);
    gl.useProgram(P.blit);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(U(P.blit, 'uBg'), 0); gl.uniform2f(U(P.blit, 'uRes'), vw, vh); gl.uniform4f(U(P.blit, 'uRect'), 0, 0, vw, vh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.glass);
    gl.uniform1i(U(P.glass, 'uBg'), 0); gl.uniform2f(U(P.glass, 'uRes'), vw, vh); gl.uniform2f(U(P.glass, 'uResDev'), W, H); gl.uniform1f(U(P.glass, 'uS'), S);
    gl.uniform2f(U(P.glass, 'uMouse'), pointer.mx, pointer.my);
    gl.uniform1f(U(P.glass, 'uMon'), pointer.active && finePointer ? 1 : 0);
    panes.forEach(function (pn) {
      var r = rectOf(pn.el);
      if (r.width < 2 || r.bottom < -80 || r.top > vh + 80 || r.right < -80 || r.left > vw + 80) return;
      var target = 1;
      if (pn.kind === 'nav') target = ease(clamp((t - t0 - 500) / 1000));
      else if (pn.kind === 'tag') target = ease(clamp((t - t0 - 950) / 1000)) * clamp(state.heroAlpha);
      else if (pn.fade) target = pn.fade.classList.contains('in') ? 1 : 0;
      if (!motion) target = 1;
      pn.alpha = lerp(pn.alpha, target, damp(dt, 8));
      if (pn.alpha < 0.01) return;

      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var inside = pointer.active && finePointer && pointer.mx > r.left - 14 && pointer.mx < r.right + 14 && pointer.my > r.top - 14 && pointer.my < r.bottom + 14;
      pn.hover += ((inside ? 1 : 0) - pn.hover) * damp(dt, 7);
      if (pn.kind === 'chip' || pn.kind === 'lens') {            // magnetic + springy
        var mdx = clamp((pointer.mx - cx) * 0.09, -12, 12) * pn.hover, mdy = clamp((pointer.my - cy) * 0.09, -12, 12) * pn.hover;
        if (pn.kind === 'chip') pn.el.style.transform = 'translate3d(' + mdx.toFixed(2) + 'px,' + mdy.toFixed(2) + 'px,0) scale(' + (1 + 0.06 * pn.hover).toFixed(4) + ')';
        else { state.lens.h = pn.hover; state.lens.dx = mdx; state.lens.dy = mdy; }
      }
      var hover = pn.kind === 'card' ? state.cardH[cards.indexOf(pn.el)] : pn.hover;

      var host = pn.kind === 'nav' ? null : pn.el.closest('[data-scene]');
      var light = pn.kind === 'nav' ? state.navLight : (host && host.dataset.theme === 'light' ? 1 : 0);
      var sc = r.width / (pn.el.offsetWidth || r.width);
      var rad = pn.radiusPct ? Math.min(r.width, r.height) * pn.radius / 100 : Math.min(pn.radius * sc, Math.min(r.width, r.height) / 2);
      var M = 110;
      gl.uniform4f(U(P.glass, 'uRect'), r.left - M, r.top - M, r.width + 2 * M, r.height + 2 * M);
      gl.uniform2f(U(P.glass, 'uC'), cx, cy);
      gl.uniform2f(U(P.glass, 'uH'), r.width / 2, r.height / 2);
      gl.uniform1f(U(P.glass, 'uR'), rad);
      gl.uniform1f(U(P.glass, 'uB'), pn.bevel * sc); gl.uniform1f(U(P.glass, 'uT'), pn.thick * sc);
      gl.uniform1f(U(P.glass, 'uSh'), pn.shadow); gl.uniform1f(U(P.glass, 'uFrost'), pn.frost);
      gl.uniform1f(U(P.glass, 'uA'), pn.alpha); gl.uniform1f(U(P.glass, 'uLight'), light); gl.uniform1f(U(P.glass, 'uHover'), hover);
      gl.uniform4f(U(P.glass, 'uTint'), lerp(1, 0.78, light), lerp(1, 0.83, light), lerp(1, 0.92, light), lerp(0.05, 0.3, light));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }

  // Glass panes: DOM elements with .glass; look is tuned per kind.
  $$('.glass').forEach(function (el) {
    var cl = el.classList, kind = el === nav ? 'nav' : cl.contains('tagline') ? 'tag' : cl.contains('card') ? 'card' : cl.contains('lens') ? 'lens' : 'chip';
    var look = { nav: [12, 26, 1.0, 0.2], tag: [16, 36, 1.0, 0.32], card: [34, 80, 1.6, 0.5], lens: [90, 190, 0.7, 0.45], chip: [14, 34, 1.0, 0.3] }[kind];
    panes.push({ el: el, kind: kind, bevel: look[0], thick: look[1], frost: look[2], shadow: look[3], alpha: 0, hover: 0, radius: 0, radiusPct: false, fade: el.closest('[data-fade]') });
  });

  /* ================= Main loop ================= */
  var lenis = null;
  if (motion && window.Lenis) lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1, smoothWheel: true });

  glOK = initGL();
  measure();
  if (glOK) { resizeGL(); }

  var lastT = 0, lastY = window.scrollY, hudTick = 0, emaMs = 16, calm = 0;
  function tick(t) {
    var rawMs = t - (lastT || t - 16);
    var dt = Math.min(0.05, Math.max(0.001, rawMs / 1000)); lastT = t;
    // Adaptive quality: if frames run long, drop the render resolution a step; if there is headroom, recover it.
    if (glOK && t0 && t - t0 > 3000) {
      emaMs += (Math.min(rawMs, 100) - emaMs) * 0.06;
      if (!(state.frame % 45)) {
        if (emaMs > 24 && quality > 0.55) { quality = Math.max(0.55, quality * 0.86); resizeGL(); calm = 0; }
        else if (emaMs < 15.5) { if (++calm > 6 && quality < 1) { quality = Math.min(1, quality * 1.08); resizeGL(); calm = 0; } }
        else calm = 0;
      }
    }
    if (lenis) lenis.raf(t);
    var y = window.scrollY;
    state.dy = y - lastY; lastY = y;
    state.scrollV += ((state.dy / dt) - state.scrollV) * damp(dt, 10);

    pointer.sx += (pointer.x - pointer.sx) * damp(dt, 4);
    pointer.sy += (pointer.y - pointer.sy) * damp(dt, 4);
    if (pointer.active) {                                          // springy cursor follower (overshoots a little)
      pointer.vx += (pointer.px - pointer.mx) * 220 * dt; pointer.vy += (pointer.py - pointer.my) * 220 * dt;
      var dm = Math.exp(-15 * dt); pointer.vx *= dm; pointer.vy *= dm;
      pointer.mx += pointer.vx * dt; pointer.my += pointer.vy * dt;
      var mv = Math.hypot(pointer.px - pointer.lastX, pointer.py - pointer.lastY);
      var tgt = clamp(mv / dt / 2200);
      pointer.energy += (tgt - pointer.energy) * damp(dt, tgt > pointer.energy ? 14 : 2.4);
      pointer.acc += mv; pointer.lastX = pointer.px; pointer.lastY = pointer.py;
      if (motion && pointer.acc > 150 && t - lastRipple > 240) { spawnRipple(pointer.px, pointer.py, 0.55 + pointer.energy); lastRipple = t; pointer.acc = 0; }
    } else pointer.energy += (0 - pointer.energy) * damp(dt, 3);
    state.energy = motion ? Math.max(pointer.energy, clamp(Math.abs(state.scrollV) / 4200) * 0.85) : 0;
    while (ripples.length && t - ripples[0].t > 1500) ripples.shift();

    update(y);
    if (glOK) {
      if (motion) stepParticles(t, dt);
      render(t, y, dt);
      if (!root.classList.contains('gl')) root.classList.add('gl');
    }
    state.frame++;
    if (!(hudTick++ & 3)) {
      hud.x.textContent = (pointer.sx >= 0 ? '+' : '') + pointer.sx.toFixed(2);
      hud.y.textContent = (pointer.sy >= 0 ? '+' : '') + pointer.sy.toFixed(2);
      hud.t.textContent = ('000' + state.tessAngle.toFixed(1)).slice(-5);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(measure, 120); });
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; } });
      else target.scrollIntoView();
    });
  });
})();
