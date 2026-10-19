(function () {
  'use strict';
  var root = document.documentElement;
  var motion = root.classList.contains('motion');
  var reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  var TAU = Math.PI * 2;

  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };
  var expoOut = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  var damp = function (dt, rate) { return 1 - Math.exp(-dt * rate); };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  // Motion rates (per second) used by the frame loop: quick feedback, normal state change, soft settle.
  var RATE_BASE = 8, RATE_SOFT = 5;

  // Write-through caches: skip DOM writes whose value has not changed (keeps layout and style clean).
  function sty(el, prop, val) { var c = el._c || (el._c = {}); if (c[prop] !== val) { c[prop] = val; el.style[prop] = val; } }
  function txt(el, val) { if (el._t !== val) { el._t = val; el.textContent = val; } }

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ================= DOM references ================= */
  var bar = $('#nav'), mainEl = $('#main');
  var heroInner = $('.hero-inner');
  var tessEl = $('#tess'), schematic = $('#schematic'), ringsEl = $('#rings');
  var menu = $('#menu'), menuBtn = $('#menuBtn'), menuLabel = $('.menu-label', menuBtn);
  var menuLinks = $$('[data-link]', menu);
  var inertWhileMenu = [mainEl, $('.wordmark'), $('.bar-right a.pill')];
  var chipEls = $$('.chip'), plist = $('#plist'), hl = $('#hl'), rows = $$('.row', plist), pcount = $('#pcount');
  var whereEl = $('#where'), whereN = $('#whereN'), whereT = $('#whereT'), whereB = $('#whereB');

  var scenes = $$('[data-scene]').map(function (el) { return { el: el, kind: el.dataset.scene, theme: el.dataset.theme, top: 0, h: 0, p: 0 }; });
  var sceneBy = {}; scenes.forEach(function (s) { sceneBy[s.kind] = s; });
  var LABEL = { hero: ['00', 'Home'], vision: ['01', 'Vision'], products: ['02', 'Products'], studio: ['03', 'Studio'], contact: ['04', 'Contact'] };
  var heroS = sceneBy.hero, visS = sceneBy.vision, prodS = sceneBy.products, studS = sceneBy.studio;

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

  // Headings rise out of line masks; rows stagger their children via --i.
  $$('[data-mask]').forEach(function (el) {
    el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i).map(function (line, i) {
      return '<span class="mk"><span style="transition-delay:' + (i * 0.1).toFixed(2) + 's">' + line + '</span></span>';
    }).join('');
  });
  rows.forEach(function (r, i) { r.style.setProperty('--i', i); });

  var revealTargets = $$('[data-mask], [data-fade], .row');
  if (motion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else { revealTargets.forEach(function (el) { el.classList.add('in'); }); }

  var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ================= Menu ================= */
  var lenis = null, menuOpen = false, introAt = 0;
  function setMenu(open) {
    if (open === menuOpen || !introAt) return;
    menuOpen = open;
    var r = menuBtn.getBoundingClientRect();
    menu.style.setProperty('--ox', (r.left + r.width / 2) + 'px'); menu.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
    menu.classList.toggle('open', open); root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-hidden', String(!open));
    inertWhileMenu.forEach(function (n) { if (n) n.toggleAttribute('inert', open); });
    if (open) {
      menu.removeAttribute('inert'); if (lenis) lenis.stop();
      setTimeout(function () { if (menuOpen) menuLinks[0].focus({ preventScroll: true }); }, 380);
    } else {
      menu.setAttribute('inert', ''); if (lenis) lenis.start();
      menuBtn.focus({ preventScroll: true });
    }
    menuLabel.textContent = open ? 'Close' : 'Menu';
  }
  menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ================= Section indicator ================= */
  var whereKind = null, whereTimer = 0;
  function setWhere(kind) {
    if (kind === whereKind || !LABEL[kind]) return;
    var first = whereKind === null; whereKind = kind;
    if (first || !motion) { whereN.textContent = LABEL[kind][0]; whereT.textContent = LABEL[kind][1]; return; }
    clearTimeout(whereTimer);
    whereT.className = 'out';
    whereTimer = setTimeout(function () {
      whereN.textContent = LABEL[kind][0]; whereT.textContent = LABEL[kind][1]; whereT.className = 'pre';
      void whereT.offsetWidth; whereT.className = '';
    }, 260);
  }

  /* ================= Loader / intro ================= */
  var loader = $('#loader'), loaderN = $('#loaderN');
  function startIntro() {
    if (introAt) return;
    introAt = performance.now();
    root.classList.add('ready');
    if (lenis && !menuOpen) lenis.start();
    if (loader) { loader.classList.add('done'); setTimeout(function () { loader.classList.add('gone'); }, 1500); }
  }
  if (motion && loader) {
    var ls = performance.now(), minMs = 1400, fontsReady = false;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { fontsReady = true; });
    (function count() {
      var k = clamp((performance.now() - ls) / minMs);
      loaderN.textContent = ('00' + Math.round(ease(k) * 100)).slice(-3);
      if (k < 1 || !fontsReady) { if (performance.now() - ls < 6000) return requestAnimationFrame(count); }
      loaderN.textContent = '100'; setTimeout(startIntro, 180);
    })();
  } else { introAt = performance.now(); root.classList.add('ready'); }

  /* ================= Layout metrics (no per-frame layout reads except glass/art rects) ================= */
  var vw = window.innerWidth, vh = window.innerHeight;
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight;
    var sy = window.scrollY;
    scenes.forEach(function (s) { var r = s.el.getBoundingClientRect(); s.top = r.top + sy; s.h = r.height; });
    panes.forEach(function (p) {
      var cs = getComputedStyle(p.el).borderRadius;
      p.radiusPct = /%/.test(cs); p.radius = parseFloat(cs) || 0;
    });
    if (glOK) resizeGL();
  }

  /* ================= Products: scroll steps the glass bar through the rows ================= */
  var STEP = 0.55;                                  // viewport-heights of scroll per row (CSS pin height matches)
  var hoverRow = null, activeRow = null, hlY = 0, hlH = 0, hlOn = 0, lastY = window.scrollY;
  rows.forEach(function (row) { row.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hoverRow = row; }); });
  plist.addEventListener('mouseleave', function () { hoverRow = null; });

  /* ================= Per-frame DOM update (writes only, cached) ================= */
  var state = { sp: 0, heroP: 0, heroAlpha: 1, tessScale: 1, tessAlpha: 1, schematicP: 0, navLight: 0, theme: 'dark', current: '' };

  function update(y, dt) {
    var i;
    state.sp = y / 1000;
    for (i = 0; i < scenes.length; i++) scenes[i].p = clamp((y - scenes[i].top) / Math.max(1, scenes[i].h - vh));
    sty(whereB, 'transform', 'scaleX(' + clamp(y / Math.max(1, document.documentElement.scrollHeight - vh)).toFixed(3) + ')');

    if (motion) {
      var hp = clamp(y / Math.max(vh, 1));
      state.heroP = hp;
      state.heroAlpha = 1 - clamp((hp - 0.1) / 0.55);
      sty(heroInner, 'transform', 'translate3d(' + (pointer.sx * 12).toFixed(1) + 'px,' + (hp * vh * 0.5 + pointer.sy * 7).toFixed(1) + 'px,0) scale(' + (1 - hp * 0.16).toFixed(3) + ')');
      sty(heroInner, 'opacity', clamp(state.heroAlpha).toFixed(2));
      state.tessScale = 1 + hp * 0.25;
      state.tessAlpha = 1 - hp * 0.85;

      if (y > visS.top - vh && y < visS.top + visS.h) {
        var n = words.length, wp = clamp((visS.p - 0.06) / 0.74) * (n + 5);
        for (i = 0; i < n; i++) sty(words[i], 'opacity', (0.14 + 0.86 * clamp((wp - i) / 5)).toFixed(2));
        state.schematicP = clamp((visS.p - 0.02) / 0.7);
      }
      for (i = 0; i < layers.length; i++) {
        var l = layers[i], sc2 = l.scene, d;
        if (sc2 === visS || sc2 === prodS || sc2 === studS) d = (sc2.p - 0.5) * vh;
        else if (sc2 === heroS) d = clamp(y / vh) * vh * 0.6;
        else d = vh / 2 - (sc2.top - y + sc2.h / 2);
        sty(l.el, 'translate', '0 ' + (-d * l.s).toFixed(1) + 'px');
      }
    }

    // Studio: while pinned, the chips light up one by one with scroll (all on without motion).
    for (i = 0; i < chipEls.length; i++) { var onC = !motion || studS.p > 0.2 + i * 0.22; if (onC !== chipEls[i]._on) { chipEls[i]._on = onC; chipEls[i].classList.toggle('on', onC); } }

    // Products: while pinned, scroll steps through the rows (equal steps; the last row holds); real-mouse hover overrides.
    if (hoverRow && Math.abs(y - lastY) > 1.5) hoverRow = null;
    lastY = y;
    var nRows = rows.length;
    var inView = y > prodS.top - vh * 0.55 && y < prodS.top + prodS.h - vh * 0.1;
    var idx = motion ? Math.max(0, Math.min(nRows - 1, Math.floor((y - prodS.top) / (vh * STEP)))) : 0;
    var act = hoverRow || rows[idx];
    if (act !== activeRow) {
      if (activeRow) activeRow.classList.remove('active');
      activeRow = act; act.classList.add('active');
      txt(pcount, '0' + (rows.indexOf(act) + 1) + ' / 0' + nRows);
    }
    var tY = act.offsetTop, tH = act.offsetHeight;
    if (hlOn < 0.05 || !hlH) { hlY = tY; hlH = tH; } else { var kk = damp(dt, RATE_BASE + 1); hlY += (tY - hlY) * kk; hlH += (tH - hlH) * kk; }
    hlOn += ((inView || hoverRow ? 1 : 0) - hlOn) * damp(dt, RATE_BASE);
    sty(hl, 'transform', 'translate3d(0,' + hlY.toFixed(1) + 'px,0)');
    sty(hl, 'height', Math.round(hlH) + 'px');

    // Which scene is under the bar / centred / under the bottom-left indicator.
    var theme = 'dark', whereTheme = 'dark', current = 'hero', whereKind2 = 'hero';
    for (i = 0; i < scenes.length; i++) {
      var s = scenes[i], top = s.top - y, bot = top + s.h;
      if (top <= 40 && bot > 40) theme = s.theme;
      if (top <= vh - 60 && bot > vh - 60) { whereTheme = s.theme; whereKind2 = s.kind; }
      if (top <= vh * 0.45 && bot > vh * 0.45) current = s.kind;
    }
    state.theme = theme;
    if (bar.dataset.theme !== theme) bar.dataset.theme = theme;
    if (whereEl.dataset.theme !== whereTheme) whereEl.dataset.theme = whereTheme;
    setWhere(whereKind2);
    if (current !== state.current) {
      state.current = current;
      for (i = 0; i < menuLinks.length; i++) menuLinks[i].classList.toggle('is-active', menuLinks[i].dataset.link === current);
    }
  }

  /* ================= Geometry: tesseract ================= */
  var T4 = { v: [], e: [] };
  (function () {
    var i, j;
    for (i = 0; i < 16; i++) T4.v.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1), (i & 8 ? 1 : -1)]);
    for (i = 0; i < 16; i++) for (j = i + 1; j < 16; j++) { var d = i ^ j; if (d === 1 || d === 2 || d === 4 || d === 8) T4.e.push([i, j]); }
  })();
  var tq = [0, 0, 0, 0], tpts = new Float32Array(16 * 3);
  function rot4(p, a, b, ang) { var c = Math.cos(ang), s = Math.sin(ang), x = p[a], y = p[b]; p[a] = x * c - y * s; p[b] = x * s + y * c; }
  var TESS_COL = [[0.39, 0.82, 1], [0.75, 0.59, 1]], TESS_SC = [1, 0.52], TESS_W = [1.4, 1], TESS_G = [0.55, 0.4];
  var INK = [0.12, 0.12, 0.14], BLUE = [0.04, 0.52, 1];

  /* ================= WebGL2 renderer ================= */
  var glc = $('#gl'), gl = null, glOK = false;
  var P = {}, vaoQuad, vaoLines, lineBuf, fbo, bgTex;
  var MAXSEG = 6000, SEGF = 10;
  var seg = new Float32Array(MAXSEG * SEGF), nseg = 0;
  var RG = [], rgN = 0, i0;
  for (i0 = 0; i0 < 8; i0++) RG.push({ start: 0, n: 0, mode: 0, top: 0, bot: 0 });
  var SR = scenes.map(function (s) { return { top: 0, bot: 0, s: s }; });
  var S = 1, W = 1, H = 1, quality = 1, ceilQ = 1;
  var panes = [];

  var ATTRS = [[0, 2, 0], [1, 2, 8], [2, 4, 16], [3, 2, 32]];
  function setLineBase(first) {
    for (var i = 0; i < ATTRS.length; i++) gl.vertexAttribPointer(ATTRS[i][0], ATTRS[i][1], gl.FLOAT, false, SEGF * 4, first * SEGF * 4 + ATTRS[i][2]);
  }

  var VS_QUAD = '#version 300 es\nuniform vec4 uRect; uniform vec2 uRes; out vec2 vP;\n' +
    'void main(){ vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1)); vec2 p=uRect.xy+c*uRect.zw; vP=p;\n' +
    ' gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }';

  // Background: scene colour + topographic contour lines (isolines of a slowly drifting noise field); rounded sheet corners.
  var FS_BG = '#version 300 es\nprecision highp float; in vec2 vP; out vec4 o;\n' +
    'uniform vec3 uBg; uniform vec3 uGrid; uniform float uOff; uniform vec2 uMaskC; uniform vec2 uMaskR; uniform vec2 uA; uniform float uTime;\n' +
    'uniform vec2 uVp; uniform float uTopY, uCorner;\n' +
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }\n' +
    'float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(17.,9.); a*=.5; } return s; }\n' +
    'float iso(float v){ float d=abs(fract(v-.5)-.5)/max(fwidth(v),1e-4); return 1.-smoothstep(0.,1.3,d); }\n' +
    'void main(){\n' +
    ' float cov=1.; if(uCorner>0.&&vP.y-uTopY<uCorner){ float cx=clamp(vP.x,uCorner,uVp.x-uCorner); cov=clamp(uCorner-length(vec2(vP.x-cx,vP.y-(uTopY+uCorner)))+.5,0.,1.); }\n' +
    ' vec2 q=vec2(vP.x,vP.y-uOff)/300.+vec2(uTime*.000022,-uTime*.000015);\n' +
    ' float n=fbm(q)*15.;\n' +
    ' float g=max(iso(n)*uA.x, iso(n/5.+.31)*uA.y);\n' +
    ' float m=1.-smoothstep(.2,.8,length((vP-uMaskC)/uMaskR)); vec3 c=mix(uBg,uGrid,g*m);\n' +
    ' c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.; o=vec4(c*cov,cov); }';

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

  // Glass: refraction through a bevelled slab with rim light, sheen and a soft drop shadow.
  var FS_GLASS = '#version 300 es\nprecision highp float; in vec2 vP; out vec4 o;\n' +
    'uniform sampler2D uBg; uniform vec2 uResDev; uniform float uS; uniform vec2 uC; uniform vec2 uH;\n' +
    'uniform float uR, uB, uT, uFrost, uA, uLight, uSh; uniform vec4 uTint;\n' +
    'float sd(vec2 p){ vec2 q=abs(p-uC)-uH+uR; return length(max(q,0.))+min(max(q.x,q.y),0.)-uR; }\n' +
    'float hh(float t){ return pow(max(1.-pow(1.-t,4.),0.),.25); }\n' +
    'vec3 bg(vec2 p,float lod){ vec2 uv=vec2(p.x*uS/uResDev.x, 1.-p.y*uS/uResDev.y); return textureLod(uBg,clamp(uv,vec2(.001),vec2(.999)),lod).rgb; }\n' +
    'void main(){\n' +
    ' float d=sd(vP); float cov=clamp(.5-d,0.,1.);\n' +
    ' float sig=clamp(uB*.3+8.,10.,34.); float ds=sd(vP-vec2(0.,min(uH.y*.1+6.,16.))); float sh=exp(-max(ds,0.)/sig)*uSh*mix(1.,.35,uLight);\n' +
    ' if(d>.5&&sh<.004) discard;\n' +
    ' vec3 col=vec3(0.);\n' +
    ' if(cov>0.){\n' +
    '  float depth=max(-d,0.); float t=clamp(depth/uB,0.,1.);\n' +
    '  float e=.03; float slope=(hh(min(t+e,1.))-hh(max(t-e,0.)))/(2.*e); slope=min(slope,10.);\n' +
    '  vec2 g=vec2(sd(vP+vec2(1.,0.))-sd(vP-vec2(1.,0.)), sd(vP+vec2(0.,1.))-sd(vP-vec2(0.,1.))); g=length(g)>1e-4?normalize(g):vec2(0.);\n' +
    '  vec3 n=normalize(vec3(g*(uT/uB)*slope*.6,1.));\n' +
    '  vec3 r=refract(vec3(0.,0.,-1.),n,1./1.5); vec2 disp=r.xy*(uT/max(-r.z,.25)); float m=length(disp); if(m>uB*1.1) disp*=uB*1.1/m;\n' +
    '  vec3 c; c.r=bg(vP+disp*1.05,uFrost).r; c.g=bg(vP+disp,uFrost).g; c.b=bg(vP+disp*.95,uFrost).b;\n' +
    '  c=mix(c,uTint.rgb,uTint.a);\n' +
    '  c*=1.-.10*(1.-t)*(1.-uLight)-.05*(1.-t)*uLight;\n' +
    '  vec2 Ld=normalize(vec2(-.55,-.8)); float lit=max(dot(g,Ld),0.); float back=max(dot(g,-Ld),0.);\n' +
    '  float edge=1.-smoothstep(0.,1.7,depth);\n' +
    '  float rim=edge*(.22+.78*lit+.5*back); float sheen=(1.-smoothstep(0.,uB*.9,depth))*(.05+.2*lit+.05*back);\n' +
    '  float gloss=(1.-smoothstep(0.,uH.y*1.1,vP.y-(uC.y-uH.y)))*.05*(1.-.6*uLight);\n' +
    '  c+=vec3(1.)*(rim*mix(.85,.9,uLight)+sheen+gloss); c-=vec3(edge*.13*uLight*(.5+.5*back));\n' +
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
    try { gl = glc.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' }); } catch { gl = null; }
    if (!gl) return false;
    try {
      P = {};
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
    return true;
  }
  // Registered once: a lost context falls back to CSS; a restored one rebuilds everything.
  glc.addEventListener('webglcontextlost', function (e) { e.preventDefault(); glOK = false; root.classList.remove('gl'); });
  glc.addEventListener('webglcontextrestored', function () { glOK = initGL(); if (glOK) resizeGL(); });

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

  /* ---- segment emission (CSS px) ---- */
  function push(ax, ay, bx, by, r, g, b, a, w, glow) {
    if (nseg >= MAXSEG) return;
    var o = nseg++ * SEGF;
    seg[o] = ax; seg[o + 1] = ay; seg[o + 2] = bx; seg[o + 3] = by; seg[o + 4] = r; seg[o + 5] = g; seg[o + 6] = b; seg[o + 7] = a; seg[o + 8] = w; seg[o + 9] = glow;
  }
  function emitCircle(cx, cy, r, a0, a1, n, c, a, w) {
    var px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
    for (var i = 1; i <= n; i++) {
      var an = a0 + (a1 - a0) * i / n, x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r;
      push(px, py, x, y, c[0], c[1], c[2], a, w, 0); px = x; py = y;
    }
  }
  function emitDashRing(cx, cy, r, dash, gap, rot, c, a, w) {
    var circ = TAU * r, period = dash + gap, cnt = Math.max(1, Math.floor(circ / period)), da = dash / r, step = TAU / cnt, parts = Math.max(1, Math.ceil(dash / 14));
    for (var i = 0; i < cnt; i++) { var a0 = rot + i * step; emitCircle(cx, cy, r, a0, a0 + da, parts, c, a, w); }
  }

  function beginRange(sc, y) {
    var top = sc.top - y, bot = top + sc.h;
    if (bot < -50 || top > vh + 50) return null;
    var r = RG[rgN]; r.start = nseg; r.top = top; r.bot = bot; return r;
  }
  function endRange(r, mode) { if (nseg > r.start) { r.n = nseg - r.start; r.mode = mode; rgN++; } }

  function drawTess(t, intro) {
    var r = tessEl.getBoundingClientRect(); if (state.tessAlpha <= 0.01) return;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2 + state.heroP * vh * 0.5, R = Math.min(r.width, r.height) * 0.2 * state.tessScale * (0.8 + 0.2 * intro);
    var sp = Math.min(state.sp, 1.2), tm = motion ? t : 0;
    var axw = tm * 0.00042 + sp * 2.6 + pointer.sx * 0.9, ayz = tm * 0.00027 + sp * 1.8 + pointer.sy * 0.9, azw = tm * 0.00019;
    var al = state.tessAlpha * intro, layer, i, e, a, b, col, sc;
    for (layer = 0; layer < 2; layer++) {
      var dir = layer ? -1 : 1; col = TESS_COL[layer]; sc = TESS_SC[layer];
      for (i = 0; i < 16; i++) {
        var v = T4.v[i]; tq[0] = v[0]; tq[1] = v[1]; tq[2] = v[2]; tq[3] = v[3];
        rot4(tq, 0, 3, axw * dir); rot4(tq, 1, 2, ayz * dir); rot4(tq, 2, 3, azw); rot4(tq, 0, 1, 0.3 + sp);
        var k = 1 / (2.5 - tq[3]), q2 = tq[2] * k, s = 3 / (3 - q2 * 1.4);
        tpts[i * 3] = cx + tq[0] * k * s * R * 2.1 * sc; tpts[i * 3 + 1] = cy + tq[1] * k * s * R * 2.1 * sc; tpts[i * 3 + 2] = q2;
      }
      for (e = 0; e < T4.e.length; e++) {
        a = T4.e[e][0] * 3; b = T4.e[e][1] * 3;
        var dd = clamp(0.5 + (tpts[a + 2] + tpts[b + 2]) * 0.9);
        push(tpts[a], tpts[a + 1], tpts[b], tpts[b + 1], col[0], col[1], col[2], (0.2 + dd * 0.8) * al, TESS_W[layer], TESS_G[layer]);
      }
      for (i = 0; i < 16; i++) push(tpts[i * 3] - 2.5, tpts[i * 3 + 1], tpts[i * 3] + 2.5, tpts[i * 3 + 1], col[0], col[1], col[2], 0.95 * al, layer ? 3 : 4.5, 1.2);
    }
  }

  // Vision schematic, drawn on as you scroll. Item i has local progress f in 0..1.
  function schemItem(i, f, cx, cy, k) {
    var a0 = -1.2, a1 = a0 + TAU * f;
    switch (i) {
      case 0: emitCircle(cx, cy, 250 * k, a0, a1, Math.max(2, Math.round(110 * f)), INK, 0.85, 1.3); break;
      case 1: emitCircle(cx, cy, 190 * k, a0, a1, Math.max(2, Math.round(100 * f)), INK, 0.45, 1.2); break;
      case 2: emitCircle(cx, cy, 130 * k, a0, a1, Math.max(2, Math.round(80 * f)), INK, 0.85, 1.3); break;
      case 3: emitCircle(cx, cy, 70 * k, a0, a1, Math.max(2, Math.round(60 * f)), INK, 0.85, 1.3); break;
      case 4: push(cx - 280 * k, cy, cx - 280 * k + 560 * k * f, cy, INK[0], INK[1], INK[2], 0.8, 1.2, 0); break;
      case 5: push(cx, cy - 280 * k, cx, cy - 280 * k + 560 * k * f, INK[0], INK[1], INK[2], 0.8, 1.2, 0); break;
      case 6: push(cx - 177 * k, cy - 177 * k, cx - 177 * k + 354 * k * f, cy - 177 * k + 354 * k * f, INK[0], INK[1], INK[2], 0.4, 1.1, 0); break;
      case 7: push(cx + 177 * k, cy - 177 * k, cx + 177 * k - 354 * k * f, cy - 177 * k + 354 * k * f, INK[0], INK[1], INK[2], 0.4, 1.1, 0); break;
      case 8: push(cx, cy, cx + 130 * k * f, cy - 75 * k * f, BLUE[0], BLUE[1], BLUE[2], 1, 2.2, 0); break;
      case 9:
        var yy = cy + 248 * k;
        push(cx - 250 * k, yy, cx - 250 * k + 500 * k * f, yy, INK[0], INK[1], INK[2], 0.65, 1.2, 0);
        if (f > 0.02) push(cx - 250 * k, yy - 8 * k, cx - 250 * k, yy + 8 * k, INK[0], INK[1], INK[2], 0.65, 1.2, 0);
        if (f > 0.97) push(cx + 250 * k, yy - 8 * k, cx + 250 * k, yy + 8 * k, INK[0], INK[1], INK[2], 0.65, 1.2, 0);
        break;
    }
  }
  function drawSchematic() {
    var r = schematic.getBoundingClientRect(), k = r.width / 600, cx = r.left + 300 * k, cy = r.top + 300 * k, dp = state.schematicP;
    for (var i = 0; i < 10; i++) { var f = motion ? clamp(dp * 1.6 - i * 0.07) : 1; if (f > 0.001) schemItem(i, f, cx, cy, k); }
  }
  function drawRings(t) {
    var r = ringsEl.getBoundingClientRect(), k = r.width / 800, cx = r.left + r.width / 2, cy = r.top + r.height / 2, tm = motion ? t : 0;
    emitDashRing(cx, cy, 380 * k, 2 * k, 10 * k, 0, INK, 0.28, 1.2);
    emitDashRing(cx, cy, 320 * k, 1 * k, 7 * k, tm * 0.00007 + studS.p * 2.4, INK, 0.3, 1.2);
    emitDashRing(cx, cy, 250 * k, 40 * k, 14 * k, -tm * 0.00004 - studS.p * 1.6, INK, 0.28, 1.2);
    emitCircle(cx, cy, 170 * k, 0, TAU, 90, INK, 0.26, 1.2);
  }

  var CORNER_MAX = 46;
  function render(t, y, dt) {
    var sinceIntro = introAt ? performance.now() - introAt : -1;
    var intro = motion ? (introAt ? ease(clamp(sinceIntro / 2400)) : 0) : 1;
    state.navLight = lerp(state.navLight, state.theme === 'light' ? 1 : 0, damp(dt, 7));
    var i, rg, sr;
    for (i = 0; i < SR.length; i++) { sr = SR[i]; sr.top = scenes[i].top - y; sr.bot = sr.top + scenes[i].h; }

    nseg = 0; rgN = 0;
    if ((rg = beginRange(heroS, y))) { drawTess(t, intro); endRange(rg, 0); }
    if ((rg = beginRange(visS, y))) { drawSchematic(); endRange(rg, 1); }
    if ((rg = beginRange(sceneBy.studio, y))) { drawRings(t); endRange(rg, 1); }

    /* ---- pass A: scene backgrounds + lines -> bg texture ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vaoQuad);
    gl.useProgram(P.bg);
    gl.uniform2f(U(P.bg, 'uRes'), vw, vh); gl.uniform2f(U(P.bg, 'uVp'), vw, vh);
    gl.uniform1f(U(P.bg, 'uTime'), motion ? t : 0);
    var CORNER = Math.min(CORNER_MAX, vw * 0.04);
    for (i = 0; i < SR.length; i++) {
      sr = SR[i];
      if (sr.bot < 0 || sr.top > vh) continue;
      var s = sr.s, light = s.theme === 'light', pinned = s === visS || s === prodS || s === studS, hero = s === heroS, d;
      if (pinned) d = (s.p - 0.5) * vh; else if (hero) d = clamp(y / vh) * vh * 0.6; else d = vh / 2 - (sr.top + s.h / 2);
      var off = (pinned || hero ? 0 : sr.top) + (motion ? d * (hero ? 0.18 : 0.2) : 0);
      var mcy = (pinned || hero) ? vh / 2 : sr.top + s.h / 2;
      var mh = ((pinned || hero) ? vh * 1.32 : s.h * 1.32) / 2 * 1.4142;
      gl.uniform4f(U(P.bg, 'uRect'), 0, sr.top, vw, s.h + (i < SR.length - 1 ? CORNER : 0));
      gl.uniform1f(U(P.bg, 'uTopY'), sr.top); gl.uniform1f(U(P.bg, 'uCorner'), hero ? 0 : CORNER);
      gl.uniform3f(U(P.bg, 'uBg'), light ? 0.9608 : 0, light ? 0.9608 : 0, light ? 0.9686 : 0);
      gl.uniform3f(U(P.bg, 'uGrid'), light ? 0 : 0.55, light ? 0 : 0.85, light ? 0 : 1);
      var cm = s.kind === 'contact' ? 0.55 : 1;     // quieter lines behind the closing headline
      gl.uniform2f(U(P.bg, 'uA'), light ? 0.05 : 0.095 * cm, light ? 0.115 : 0.21 * cm);
      gl.uniform1f(U(P.bg, 'uOff'), off);
      gl.uniform2f(U(P.bg, 'uMaskC'), vw / 2, mcy);
      gl.uniform2f(U(P.bg, 'uMaskR'), vw / 2 * 1.4142, mh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (nseg) {
      gl.bindVertexArray(vaoLines);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, seg.subarray(0, nseg * SEGF));
      gl.useProgram(P.line);
      gl.uniform2f(U(P.line, 'uRes'), vw, vh); gl.uniform1f(U(P.line, 'uHalf'), 7);
      gl.enable(gl.SCISSOR_TEST);
      for (i = 0; i < rgN; i++) {
        rg = RG[i];
        gl.blendFunc(gl.ONE, rg.mode === 0 ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(U(P.line, 'uMode'), rg.mode);
        var y0 = Math.max(0, rg.top), y1 = Math.min(vh, rg.bot);
        gl.scissor(0, Math.floor((vh - y1) * S), W, Math.max(0, Math.ceil((y1 - y0) * S)));
        setLineBase(rg.start);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rg.n);
      }
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
    for (i = 0; i < panes.length; i++) {
      var pn = panes[i], sc = pn.scene;
      if (sc && (sc.top - y > vh + 160 || sc.top + sc.h - y < -160)) { pn.alpha = 0; continue; }   // pane's scene is far off-screen: skip the rect read
      var r = pn.el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < -80 || r.top > vh + 80 || r.right < -80 || r.left > vw + 80) continue;
      var target = 1;
      if (pn.kind === 'pill') target = menuOpen ? 0 : ease(clamp((sinceIntro - 500) / 1000));
      else if (pn.kind === 'tag') target = ease(clamp((sinceIntro - 1200) / 1000)) * clamp(state.heroAlpha);
      else if (pn.kind === 'hl') target = hlOn;
      else if (pn.kind === 'chip') target = pn.el._on ? 1 : 0;
      else if (pn.fade) target = pn.fade.classList.contains('in') ? 1 : 0;
      if (!motion) target = pn.kind === 'hl' ? hlOn : 1;
      if (pn.kind === 'hl') target *= clamp((r.top - 40) / 90);     // never glide over the top bar
      pn.alpha = lerp(pn.alpha, target, damp(dt, (pn.kind === 'tag' && target < pn.alpha) ? 20 : RATE_BASE));
      if (pn.alpha < 0.01) continue;

      var lightP = pn.kind === 'pill' ? state.navLight : (sc && sc.theme === 'light' ? 1 : 0);
      var scl = r.width / (pn.el.offsetWidth || r.width);
      var rad = pn.radiusPct ? Math.min(r.width, r.height) * pn.radius / 100 : Math.min(pn.radius * scl, Math.min(r.width, r.height) / 2);
      var M = 110;
      gl.uniform4f(U(P.glass, 'uRect'), r.left - M, r.top - M, r.width + 2 * M, r.height + 2 * M);
      gl.uniform2f(U(P.glass, 'uC'), r.left + r.width / 2, r.top + r.height / 2);
      gl.uniform2f(U(P.glass, 'uH'), r.width / 2, r.height / 2);
      gl.uniform1f(U(P.glass, 'uR'), rad);
      var bsc = Math.min(1, 0.3 * Math.min(r.width, r.height) / (pn.bevel * scl));      // small panes: keep the bevel inside the pane
      gl.uniform1f(U(P.glass, 'uB'), pn.bevel * scl * bsc); gl.uniform1f(U(P.glass, 'uT'), pn.thick * scl * bsc);
      gl.uniform1f(U(P.glass, 'uSh'), pn.shadow); gl.uniform1f(U(P.glass, 'uFrost'), pn.frost);
      gl.uniform1f(U(P.glass, 'uA'), pn.alpha); gl.uniform1f(U(P.glass, 'uLight'), lightP);
      gl.uniform4f(U(P.glass, 'uTint'), lerp(1, 0.9, lightP), lerp(1, 0.92, lightP), lerp(1, 0.96, lightP), lerp(0.05, 0.12, lightP));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  // Glass panes: DOM elements with .glass; look is tuned per kind.
  $$('.glass').forEach(function (el) {
    var cl = el.classList, kind = cl.contains('pill') ? 'pill' : cl.contains('tagline') ? 'tag' : cl.contains('hl') ? 'hl' : 'chip';
    var look = { pill: [10, 22, 1.0, 0.16], tag: [16, 36, 1.0, 0.32], hl: [26, 60, 1.4, 0.3], chip: [14, 34, 1.0, 0.3] }[kind];
    var host = kind === 'pill' ? null : el.closest('[data-scene]');
    panes.push({ el: el, kind: kind, bevel: look[0], thick: look[1], frost: look[2], shadow: look[3], alpha: 0, radius: 0, radiusPct: false, fade: el.closest('[data-fade]'), scene: host ? sceneBy[host.dataset.scene] : null });
  });

  /* ================= Main loop ================= */
  if (motion && window.Lenis) { lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1, smoothWheel: true }); if (!introAt) lenis.stop(); }

  glOK = initGL();
  measure();
  if (glOK) resizeGL();

  // ?perf shows frame time, render scale and the GPU in a corner overlay, so real-device numbers can be pasted back.
  var perfEl = null, perfAt = 0;
  if (/[?&]perf\b/.test(location.search)) {
    perfEl = document.createElement('pre');
    perfEl.style.cssText = 'position:fixed;z-index:999;left:8px;top:8px;margin:0;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.75);color:#7CFC9A;font:11px/1.4 ui-monospace,Menlo,monospace;pointer-events:none';
    document.body.appendChild(perfEl);
  }
  function perfText() {
    var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return 'frame ' + emaMs.toFixed(1) + ' ms (' + Math.round(1000 / emaMs) + ' fps)\nscale ' + S.toFixed(2) + ' (quality ' + quality.toFixed(2) + ')\ncanvas ' + W + 'x' + H + '\ngpu ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : glOK ? 'webgl2' : 'none (CSS fallback)');
  }

  var lastT = 0, emaMs = 16, calm = 0, frame = 0, firstT = 0, lastQ = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    try {
      if (!firstT) firstT = t;
      var rawMs = t - (lastT || t - 16);
      var dt = Math.min(0.05, Math.max(0.001, rawMs / 1000)); lastT = t;
      // Adaptive quality: step the render resolution down when frames run long; recover (below the failed level) when there is headroom.
      if (glOK && t - firstT > 3500) {
        emaMs += (Math.min(rawMs, 100) - emaMs) * 0.06;
        if (!(frame % 45)) {
          if (emaMs > 24 && quality > 0.55 && t - lastQ > 2500) { ceilQ = quality * 0.95; quality = Math.max(0.55, quality * 0.86); lastQ = t; resizeGL(); calm = 0; }
          else if (emaMs < 18.5 && quality < ceilQ) { if (++calm > 8 && t - lastQ > 6000) { quality = Math.min(ceilQ, quality * 1.08); lastQ = t; resizeGL(); calm = 0; } }
          else calm = 0;
        }
      }
      if (lenis) lenis.raf(t);
      var y = window.scrollY;
      pointer.sx += (pointer.x - pointer.sx) * damp(dt, RATE_SOFT);
      pointer.sy += (pointer.y - pointer.sy) * damp(dt, RATE_SOFT);
      update(y, dt);
      if (glOK) {
        render(t, y, dt);
        if (!root.classList.contains('gl')) root.classList.add('gl');
      }
      frame++;
      if (perfEl && t - perfAt > 500) { perfAt = t; perfEl.textContent = perfText(); }
    } catch (err) {
      console.warn('frame error, falling back to CSS visuals', err);
      if (glOK) { glOK = false; root.classList.remove('gl'); }
    }
  }
  requestAnimationFrame(tick);

  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(measure, 120); });
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // Anchors glide to their section (duration scales with distance); links inside the menu close it first; focus follows.
  $$('a[href^="#"]:not(.skip)').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (a.closest('#menu')) setMenu(false);
      var dist = Math.abs(target.getBoundingClientRect().top);
      var dur = Math.min(2.6, Math.max(1.0, 0.8 + dist / Math.max(vh, 1) * 0.25));
      if (lenis) lenis.scrollTo(target, { duration: dur, easing: expoOut }); else target.scrollIntoView();
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (history.replaceState) history.replaceState(null, '', a.getAttribute('href'));
    });
  });
})();
