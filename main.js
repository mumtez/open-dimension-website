(function () {
  'use strict';
  var root = document.documentElement;
  var motion = root.classList.contains('motion');
  var reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  var TAU = Math.PI * 2;

  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };
  var damp = function (dt, rate) { return 1 - Math.exp(-dt * rate); };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ================= DOM references ================= */
  var bar = $('#nav');
  var heroInner = $('.hero-inner');
  var tessEl = $('#tess'), schematic = $('#schematic'), ringsEl = $('#rings'), lensEl = $('.lens');
  var labs = $$('.lab', schematic);
  var menu = $('#menu'), menuBtn = $('#menuBtn'), menuLabel = $('.menu-label', menuBtn);
  var menuLinks = $$('[data-link]', menu);
  var plist = $('#plist'), hl = $('#hl'), rows = $$('.row', plist), pcount = $('#pcount');
  var whereEl = $('#where'), whereN = $('#whereN'), whereT = $('#whereT'), whereB = $('#whereB');
  var hud = { x: $('#hx'), y: $('#hy'), t: $('#ht') };

  var scenes = $$('[data-scene]').map(function (el) { return { el: el, kind: el.dataset.scene, theme: el.dataset.theme, top: 0, h: 0, p: 0 }; });
  var sceneBy = {}; scenes.forEach(function (s) { sceneBy[s.kind] = s; });
  var LABEL = { hero: ['00', 'Home'], vision: ['01', 'Vision'], products: ['02', 'Products'], studio: ['03', 'Studio'], contact: ['04', 'Contact'] };

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

  // Headings rise out of line masks.
  $$('[data-mask]').forEach(function (el) {
    el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i).map(function (line, i) {
      return '<span class="mk"><span style="transition-delay:' + (i * 0.1).toFixed(2) + 's">' + line + '</span></span>';
    }).join('');
  });

  // Reveal on scroll.
  var revealTargets = $$('[data-mask], [data-fade], .row');
  if (motion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    revealTargets.forEach(function (el, i) { if (el.classList.contains('row')) el.style.transitionDelay = ''; io.observe(el); });
  } else { revealTargets.forEach(function (el) { el.classList.add('in'); }); }

  var pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ================= Menu ================= */
  var lenis = null, menuOpen = false;
  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    var r = menuBtn.getBoundingClientRect();
    menu.style.setProperty('--ox', (r.left + r.width / 2) + 'px'); menu.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
    menu.classList.toggle('open', open); root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-hidden', String(!open));
    if (open) { menu.removeAttribute('inert'); if (lenis) lenis.stop(); } else { menu.setAttribute('inert', ''); if (lenis) lenis.start(); }
    menuLabel.textContent = open ? 'Close' : 'Menu';
  }
  menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ================= Section indicator ================= */
  var whereKind = null, whereTimer = 0;
  function setWhere(kind) {
    if (kind === whereKind || !LABEL[kind]) return;
    var first = whereKind === null; whereKind = kind;
    whereN.textContent = LABEL[kind][0];
    if (first || !motion) { whereT.textContent = LABEL[kind][1]; return; }
    clearTimeout(whereTimer);
    whereT.className = 'out';
    whereTimer = setTimeout(function () {
      whereT.textContent = LABEL[kind][1]; whereT.className = 'pre';
      void whereT.offsetWidth; whereT.className = '';
    }, 260);
  }

  /* ================= Loader / intro ================= */
  var loader = $('#loader'), loaderN = $('#loaderN'), introAt = 0;
  function startIntro() {
    if (introAt) return;
    introAt = performance.now();
    root.classList.add('ready');
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

  /* ================= Layout metrics (no per-frame layout reads) ================= */
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

  /* ================= Products: glass bar slides to the hovered row ================= */
  var hoverRow = null, activeRow = null, hlY = 0, hlH = 0, hlOn = 0;
  rows.forEach(function (row) { row.addEventListener('mouseenter', function () { hoverRow = row; }); });
  plist.addEventListener('mouseleave', function () { hoverRow = null; });

  /* ================= Per-frame DOM update (writes only) ================= */
  var state = { sp: 0, heroAlpha: 1, tessScale: 1, tessAlpha: 1, schematicP: 0, navLight: 0, theme: 'dark', tessAngle: 0 };

  function update(y, dt) {
    state.sp = y / 1000;
    scenes.forEach(function (s) { s.p = clamp((y - s.top) / Math.max(1, s.h - vh)); });

    whereB.style.transform = 'scaleX(' + clamp(y / Math.max(1, document.documentElement.scrollHeight - vh)).toFixed(4) + ')';

    if (motion) {
      var hp = clamp(y / vh);
      state.heroAlpha = 1 - hp * 1.3;
      heroInner.style.transform = 'translate3d(' + (pointer.sx * 12).toFixed(2) + 'px,' + (-hp * 8 * vh / 100 + pointer.sy * 7).toFixed(2) + 'px,0) scale(' + (1 - hp * 0.16).toFixed(4) + ')';
      heroInner.style.opacity = clamp(state.heroAlpha).toFixed(3);
      state.tessScale = 1 + hp * 0.25;
      state.tessAlpha = 1 - hp * 0.85;

      var vis = sceneBy.vision, i;
      if (y > vis.top - vh && y < vis.top + vis.h) {
        var n = words.length, wp = clamp((vis.p - 0.06) / 0.72) * n;
        for (i = 0; i < n; i++) words[i].style.opacity = (0.14 + 0.86 * clamp(wp - i)).toFixed(3);
        state.schematicP = clamp((vis.p - 0.02) / 0.7);
        var lo = clamp((state.schematicP - 0.55) * 3).toFixed(2);
        for (i = 0; i < labs.length; i++) labs[i].style.opacity = lo;
        lensEl.style.transform = 'scale(' + (0.85 + vis.p * 0.5).toFixed(4) + ')';
      }
      for (i = 0; i < layers.length; i++) {
        var l = layers[i], sc2 = l.scene, rt = sc2.top - y, d;
        if (sc2.kind === 'vision' || sc2.kind === 'products') d = (sc2.p - 0.5) * vh;
        else if (sc2.kind === 'hero') d = clamp(y / vh) * vh * 0.6;
        else d = vh / 2 - (rt + sc2.h / 2);
        l.el.style.translate = '0 ' + (-d * l.s).toFixed(2) + 'px';
      }
    }

    // Products: while pinned, scroll steps through the rows (the last one holds a beat, then the page continues).
    // Hover overrides. The glass bar glides to the active row.
    var prod = sceneBy.products, nRows = rows.length;
    var inView = y > prod.top - vh * 0.55 && y < prod.top + prod.h - vh * 0.1;
    var idx = motion ? Math.min(nRows - 1, Math.floor(clamp((y - prod.top) / Math.max(1, prod.h - vh)) * (nRows + 0.5))) : 0;
    var act = hoverRow || rows[idx];
    if (act !== activeRow) {
      if (activeRow) activeRow.classList.remove('active');
      activeRow = act; act.classList.add('active');
      pcount.textContent = '0' + (rows.indexOf(act) + 1) + ' / 0' + nRows;
    }
    var tY = act.offsetTop, tH = act.offsetHeight;
    if (hlOn < 0.05 || !hlH) { hlY = tY; hlH = tH; } else { var kk = damp(dt, 9); hlY += (tY - hlY) * kk; hlH += (tH - hlH) * kk; }
    hlOn += ((inView || hoverRow ? 1 : 0) - hlOn) * damp(dt, 8);
    hl.style.transform = 'translate3d(0,' + hlY.toFixed(2) + 'px,0)';
    hl.style.height = hlH.toFixed(1) + 'px';

    // which scene is under the bar / centred in view
    var theme = 'dark', whereTheme = 'dark', current = 'hero';
    for (var j = 0; j < scenes.length; j++) {
      var s = scenes[j], top = s.top - y, bot = top + s.h;
      if (top <= 40 && bot > 40) theme = s.theme;
      if (top <= vh - 30 && bot > vh - 30) whereTheme = s.theme;
      if (top <= vh * 0.45 && bot > vh * 0.45) current = s.kind;
    }
    state.theme = theme;
    if (bar.dataset.theme !== theme) bar.dataset.theme = theme;
    if (whereEl.dataset.theme !== whereTheme) whereEl.dataset.theme = whereTheme;
    setWhere(current);
    menuLinks.forEach(function (a) { a.classList.toggle('is-active', a.dataset.link === current); });
  }

  /* ================= Wireframe geometry ================= */
  var T4 = { v: [], e: [] };
  (function () {
    var i, j;
    for (i = 0; i < 16; i++) T4.v.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1), (i & 8 ? 1 : -1)]);
    for (i = 0; i < 16; i++) for (j = i + 1; j < 16; j++) { var d = i ^ j; if (d === 1 || d === 2 || d === 4 || d === 8) T4.e.push([i, j]); }
  })();
  function rot4(p, a, b, ang) { var c = Math.cos(ang), s = Math.sin(ang), x = p[a], y = p[b]; p[a] = x * c - y * s; p[b] = x * s + y * c; }

  /* ================= WebGL2 renderer ================= */
  var glc = $('#gl'), gl = null, glOK = false;
  var P = {}, vaoQuad, vaoLines, lineBuf, fbo, bgTex;
  var MAXSEG = 8000, SEGF = 10;
  var seg = new Float32Array(MAXSEG * SEGF), nseg = 0;
  var ranges = [];
  var S = 1, W = 1, H = 1, quality = 1;     // quality: adaptive render-scale multiplier
  var panes = [];

  var ATTRS = [[0, 2, 0], [1, 2, 8], [2, 4, 16], [3, 2, 32]];
  function setLineBase(first) {
    for (var i = 0; i < ATTRS.length; i++) gl.vertexAttribPointer(ATTRS[i][0], ATTRS[i][1], gl.FLOAT, false, SEGF * 4, first * SEGF * 4 + ATTRS[i][2]);
  }

  var VS_QUAD = '#version 300 es\nuniform vec4 uRect; uniform vec2 uRes; out vec2 vP;\n' +
    'void main(){ vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1)); vec2 p=uRect.xy+c*uRect.zw; vP=p;\n' +
    ' gl_Position=vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }';

  // Background: scene colour + topographic contour lines (isolines of a slowly drifting noise field).
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
    ' float sig=clamp(uB*.3+8.,10.,34.); float ds=sd(vP-vec2(0.,min(uH.y*.12+8.,22.))); float sh=exp(-max(ds,0.)/sig)*uSh*mix(1.,.62,uLight);\n' +
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
    var circ = TAU * r, period = dash + gap, cnt = Math.max(1, Math.floor(circ / period)), da = dash / r, step = TAU / cnt;
    for (var i = 0; i < cnt; i++) {
      var a0 = rot + i * step, parts = Math.max(1, Math.ceil(dash / 14));
      emitCircle(cx, cy, r, a0, a0 + da, parts, c, a, w);
    }
  }

  var rectOf = function (el) { return el.getBoundingClientRect(); };

  function render(t, y, dt) {
    var intro = motion ? (introAt ? ease(clamp((performance.now() - introAt) / 2400)) : 0) : 1;
    var sinceIntro = introAt ? performance.now() - introAt : -1;
    state.navLight = lerp(state.navLight, state.theme === 'light' ? 1 : 0, damp(dt, 7));
    var ink = [0.12, 0.12, 0.14], blue = [0.04, 0.52, 1];
    var sceneRects = scenes.map(function (s) { var top = s.top - y; return { top: top, bot: top + s.h, s: s }; });

    nseg = 0; ranges.length = 0;
    function range(kind, mode, build) {
      var sc = sceneBy[kind], top = sc.top - y, bot = top + sc.h;
      if (bot < -50 || top > vh + 50) return;
      var start = nseg; build(sc); if (nseg > start) ranges.push({ start: start, n: nseg - start, mode: mode, top: top, bot: bot });
    }

    // hero tesseract (additive on dark)
    range('hero', 0, function () {
      var r = rectOf(tessEl); if (state.tessAlpha <= 0.01) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = Math.min(r.width, r.height) * 0.2 * state.tessScale * (0.8 + 0.2 * intro);
      var sp = Math.min(state.sp, 1.2), tm = motion ? t : 0;
      var axw = tm * 0.00042 + sp * 2.6 + pointer.sx * 0.9, ayz = tm * 0.00027 + sp * 1.8 + pointer.sy * 0.9, azw = tm * 0.00019;
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
          push(a[0], a[1], b[0], b[1], cfg[1][0], cfg[1][1], cfg[1][2], (0.2 + d * 0.8) * al, cfg[2], cfg[3]);
        });
        pts.forEach(function (p) { push(p[0] - 2.5, p[1], p[0] + 2.5, p[1], cfg[1][0], cfg[1][1], cfg[1][2], 0.95 * al, layer ? 3 : 4.5, 1.2); });
      });
    });

    // vision schematic (ink on light): draws itself as you scroll
    range('vision', 1, function () {
      var r = rectOf(schematic), k = r.width / 600, cx = r.left + 300 * k, cy = r.top + 300 * k, dp = state.schematicP;
      var items = [
        function (f) { emitCircle(cx, cy, 250 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(110 * f)), ink, 0.85, 1.3); },
        function (f) { emitCircle(cx, cy, 190 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(100 * f)), ink, 0.45, 1.2); },
        function (f) { emitCircle(cx, cy, 130 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(80 * f)), ink, 0.85, 1.3); },
        function (f) { emitCircle(cx, cy, 70 * k, -1.2, -1.2 + TAU * f, Math.max(2, Math.round(60 * f)), ink, 0.85, 1.3); },
        function (f) { push(cx - 280 * k, cy, cx - 280 * k + 560 * k * f, cy, ink[0], ink[1], ink[2], 0.8, 1.2, 0); },
        function (f) { push(cx, cy - 280 * k, cx, cy - 280 * k + 560 * k * f, ink[0], ink[1], ink[2], 0.8, 1.2, 0); },
        function (f) { push(cx - 177 * k, cy - 177 * k, cx - 177 * k + 354 * k * f, cy - 177 * k + 354 * k * f, ink[0], ink[1], ink[2], 0.4, 1.1, 0); },
        function (f) { push(cx + 177 * k, cy - 177 * k, cx + 177 * k - 354 * k * f, cy - 177 * k + 354 * k * f, ink[0], ink[1], ink[2], 0.4, 1.1, 0); },
        function (f) { push(cx, cy, cx + 130 * k * f, cy - 75 * k * f, blue[0], blue[1], blue[2], 1, 2.2, 0); },
        function (f) { var yy = cy + 248 * k; push(cx - 250 * k, yy, cx - 250 * k + 500 * k * f, yy, ink[0], ink[1], ink[2], 0.65, 1.2, 0); if (f > 0.02) push(cx - 250 * k, yy - 8 * k, cx - 250 * k, yy + 8 * k, ink[0], ink[1], ink[2], 0.65, 1.2, 0); if (f > 0.98) push(cx + 250 * k, yy - 8 * k, cx + 250 * k, yy + 8 * k, ink[0], ink[1], ink[2], 0.65, 1.2, 0); }
      ];
      items.forEach(function (fn, idx) { var f = clamp(dp * 1.6 - idx * 0.07); if (!motion) f = 1; if (f > 0.001) fn(f); });
    });

    // studio rings (ink on light)
    range('studio', 1, function () {
      var r = rectOf(ringsEl), k = r.width / 800, cx = r.left + r.width / 2, cy = r.top + r.height / 2, tm = motion ? t : 0;
      emitDashRing(cx, cy, 380 * k, 2 * k, 10 * k, 0, ink, 0.45, 1.2);
      emitDashRing(cx, cy, 320 * k, 1 * k, 7 * k, tm * 0.00007, ink, 0.5, 1.2);
      emitDashRing(cx, cy, 250 * k, 40 * k, 14 * k, -tm * 0.00004, ink, 0.45, 1.2);
      emitCircle(cx, cy, 170 * k, 0, TAU, 90, ink, 0.4, 1.2);
    });

    /* ---- pass A: scene backgrounds + lines → bg texture ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vaoQuad);
    gl.useProgram(P.bg);
    gl.uniform2f(U(P.bg, 'uRes'), vw, vh); gl.uniform2f(U(P.bg, 'uVp'), vw, vh);
    var CORNER = Math.min(46, vw * 0.04);
    sceneRects.forEach(function (sr, si) {
      if (sr.bot < 0 || sr.top > vh) return;
      var s = sr.s, light = s.theme === 'light', pinned = s.kind === 'vision' || s.kind === 'products', hero = s.kind === 'hero';
      var d, depth;
      if (pinned) d = (s.p - 0.5) * vh; else if (hero) d = clamp(y / vh) * vh * 0.6; else d = vh / 2 - (sr.top + s.h / 2);
      depth = hero ? 0.18 : 0.2;
      var off = (pinned || hero ? 0 : sr.top) + (motion ? d * depth : 0);
      var mc = (pinned || hero) ? [vw / 2, vh / 2] : [vw / 2, sr.top + s.h / 2];
      var mh = ((pinned || hero) ? vh * 1.32 : s.h * 1.32) / 2 * 1.4142;
      gl.uniform4f(U(P.bg, 'uRect'), 0, sr.top, vw, s.h + (si < sceneRects.length - 1 ? CORNER : 0));
      gl.uniform1f(U(P.bg, 'uTopY'), sr.top); gl.uniform1f(U(P.bg, 'uCorner'), hero ? 0 : CORNER);
      gl.uniform3f(U(P.bg, 'uBg'), light ? 0.9608 : 0, light ? 0.9608 : 0, light ? 0.9686 : 0);
      gl.uniform3f(U(P.bg, 'uGrid'), light ? 0 : 0.55, light ? 0 : 0.85, light ? 0 : 1);
      gl.uniform2f(U(P.bg, 'uA'), light ? 0.06 : 0.095, light ? 0.14 : 0.21);
      gl.uniform1f(U(P.bg, 'uTime'), motion ? t : 0);
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
    panes.forEach(function (pn) {
      var r = rectOf(pn.el);
      if (r.width < 2 || r.bottom < -80 || r.top > vh + 80 || r.right < -80 || r.left > vw + 80) return;
      var target = 1;
      if (pn.kind === 'pill') target = menuOpen ? 0 : ease(clamp((sinceIntro - 500) / 1000));
      else if (pn.kind === 'tag') target = ease(clamp((sinceIntro - 950) / 1000)) * clamp(state.heroAlpha);
      else if (pn.kind === 'hl') target = hlOn;
      else if (pn.fade) target = pn.fade.classList.contains('in') ? 1 : 0;
      if (!motion) target = pn.kind === 'hl' ? hlOn : 1;
      pn.alpha = lerp(pn.alpha, target, damp(dt, 8));
      if (pn.alpha < 0.01) return;

      var host = (pn.kind === 'pill') ? null : pn.el.closest('[data-scene]');
      var light = pn.kind === 'pill' ? state.navLight : (host && host.dataset.theme === 'light' ? 1 : 0);
      var sc = r.width / (pn.el.offsetWidth || r.width);
      var rad = pn.radiusPct ? Math.min(r.width, r.height) * pn.radius / 100 : Math.min(pn.radius * sc, Math.min(r.width, r.height) / 2);
      var M = 110;
      gl.uniform4f(U(P.glass, 'uRect'), r.left - M, r.top - M, r.width + 2 * M, r.height + 2 * M);
      gl.uniform2f(U(P.glass, 'uC'), r.left + r.width / 2, r.top + r.height / 2);
      gl.uniform2f(U(P.glass, 'uH'), r.width / 2, r.height / 2);
      gl.uniform1f(U(P.glass, 'uR'), rad);
      gl.uniform1f(U(P.glass, 'uB'), pn.bevel * sc); gl.uniform1f(U(P.glass, 'uT'), pn.thick * sc);
      gl.uniform1f(U(P.glass, 'uSh'), pn.shadow); gl.uniform1f(U(P.glass, 'uFrost'), pn.frost);
      gl.uniform1f(U(P.glass, 'uA'), pn.alpha); gl.uniform1f(U(P.glass, 'uLight'), light);
      gl.uniform4f(U(P.glass, 'uTint'), lerp(1, 0.78, light), lerp(1, 0.83, light), lerp(1, 0.92, light), lerp(0.05, 0.3, light));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }

  // Glass panes: DOM elements with .glass; look is tuned per kind.
  $$('.glass').forEach(function (el) {
    var cl = el.classList, kind = cl.contains('pill') ? 'pill' : cl.contains('tagline') ? 'tag' : cl.contains('hl') ? 'hl' : cl.contains('lens') ? 'lens' : 'chip';
    var look = { pill: [10, 22, 1.0, 0.16], tag: [16, 36, 1.0, 0.32], hl: [26, 60, 1.4, 0.3], lens: [90, 190, 0.7, 0.45], chip: [14, 34, 1.0, 0.3] }[kind];
    panes.push({ el: el, kind: kind, bevel: look[0], thick: look[1], frost: look[2], shadow: look[3], alpha: 0, radius: 0, radiusPct: false, fade: el.closest('[data-fade]') });
  });

  /* ================= Main loop ================= */
  if (motion && window.Lenis) lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1, smoothWheel: true });

  glOK = initGL();
  measure();
  if (glOK) { resizeGL(); }

  var lastT = 0, hudTick = 0, emaMs = 16, calm = 0, frame = 0, firstT = 0;
  function tick(t) {
    if (!firstT) firstT = t;
    var rawMs = t - (lastT || t - 16);
    var dt = Math.min(0.05, Math.max(0.001, rawMs / 1000)); lastT = t;
    // Adaptive quality: if frames run long, step the render resolution down; recover when there is headroom.
    if (glOK && t - firstT > 3500) {
      emaMs += (Math.min(rawMs, 100) - emaMs) * 0.06;
      if (!(frame % 45)) {
        if (emaMs > 24 && quality > 0.55) { quality = Math.max(0.55, quality * 0.86); resizeGL(); calm = 0; }
        else if (emaMs < 15.5) { if (++calm > 6 && quality < 1) { quality = Math.min(1, quality * 1.08); resizeGL(); calm = 0; } }
        else calm = 0;
      }
    }
    if (lenis) lenis.raf(t);
    var y = window.scrollY;
    pointer.sx += (pointer.x - pointer.sx) * damp(dt, 4);
    pointer.sy += (pointer.y - pointer.sy) * damp(dt, 4);
    update(y, dt);
    if (glOK) {
      render(t, y, dt);
      if (!root.classList.contains('gl')) root.classList.add('gl');
    }
    frame++;
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

  // Anchors glide to their section; links inside the menu close it first.
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      var go = function () {
        if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; } });
        else target.scrollIntoView();
      };
      if (a.closest('#menu')) { setMenu(false); setTimeout(go, 420); } else go();
    });
  });
})();
