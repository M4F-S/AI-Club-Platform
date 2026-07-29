/* ================================================================
   V4 BACKGROUND ENGINE — nebula + particle field + WebGL fluid
   + loader + custom cursor + reveal. Reusable across all pages.
   ================================================================ */
(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- inject background layers ---- */
  const nebula = document.createElement('div');
  nebula.id = 'v4-nebula';
  nebula.innerHTML = '<div class="v4-blob b1"></div><div class="v4-blob b2"></div><div class="v4-blob b3"></div>';
  document.body.prepend(nebula);
  const field = document.createElement('canvas');
  field.id = 'v4-field';
  document.body.prepend(field);
  const grain = document.createElement('div');
  grain.id = 'v4-grain';
  document.body.appendChild(grain);

  /* ---- particle field ---- */
  const ctx = field.getContext('2d');
  const DPR = Math.min(devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, particles = [];
  const mouse = { x: -9999, y: -9999 };
  let energy = 0; const ripples = []; const bursts = [];
  const LINK = 142;

  const sprite = (r, g, b) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,.95)');
    gr.addColorStop(.1, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(.3, `rgba(${r},${g},${b},.75)`);
    gr.addColorStop(.58, `rgba(${r},${g},${b},.26)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return c;
  };
  const COLORS = [
    { rgb: '124,108,255', img: sprite(124, 108, 255), w: .62 },
    { rgb: '77,227,193', img: sprite(77, 227, 193), w: .28 },
    { rgb: '255,110,199', img: sprite(255, 110, 199), w: .10 },
  ];
  const pick = () => { let r = Math.random(), a = 0; for (const c of COLORS) { a += c.w; if (r <= a) return c; } return COLORS[0]; };

  function resize() {
    W = innerWidth; H = innerHeight;
    field.width = W * DPR; field.height = H * DPR;
    field.style.width = W + 'px'; field.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); seed();
  }
  function seed() {
    const n = Math.min(240, Math.round(W * H / 7500));
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: 1.7 + Math.random() * 2.9, c: pick(),
      hub: Math.random() < .08, tw: Math.random() * Math.PI * 2,
    }));
  }
  window.emitRipples = (x, y, n = 3, gap = 260) => {
    for (let i = 0; i < n; i++) setTimeout(() => ripples.push({ x, y, r: 0, max: Math.max(W, H) * .8, a: .5 }), i * gap);
  };
  window.emitBurst = (x, y, n = 20, speed = 3) => {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = (.4 + Math.random() * .6) * speed;
      bursts.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 1, decay: .012 + Math.random() * .014, r: 1.4 + Math.random() * 2.4, c: COLORS[Math.floor(Math.random() * COLORS.length)] });
    }
  };
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  addEventListener('mouseout', () => { mouse.x = -9999; mouse.y = -9999; });
  addEventListener('scroll', () => { energy = Math.min(1, energy + .14); }, { passive: true });
  addEventListener('resize', resize);

  const heroAttractor = () => {
    const el = document.querySelector('.hero h1');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  function step() {
    const att = heroAttractor();
    for (const p of particles) {
      p.x += p.vx * (1 + energy * 1.6); p.y += p.vy * (1 + energy * 1.6); p.tw += .02;
      const mdx = mouse.x - p.x, mdy = mouse.y - p.y, md = Math.hypot(mdx, mdy);
      if (md < 150 && md > 24) { p.x += mdx / md * .18; p.y += mdy / md * .18; }
      if (att) {
        const adx = att.x - p.x, ady = att.y - p.y, ad = Math.hypot(adx, ady);
        if (ad < 260 && ad > 40) { p.x += adx / ad * .12; p.y += ady / ad * .12; }
      }
      if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
    }
    energy *= .965;
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.x += b.vx; b.y += b.vy; b.vx *= .975; b.vy *= .975; b.life -= b.decay; if (b.life <= 0) bursts.splice(i, 1); }
    for (let i = ripples.length - 1; i >= 0; i--) { const rp = ripples[i]; rp.r += rp.max / 55; rp.a *= .965; if (rp.a < .01 || rp.r > rp.max) ripples.splice(i, 1); }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const boost = 1 + energy * 1.4;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          const d = Math.sqrt(d2), al = (1 - d / LINK) * .46 * boost;
          ctx.strokeStyle = `rgba(${a.c.rgb},${Math.min(al, .85)})`;
          ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      const mdx = mouse.x - a.x, mdy = mouse.y - a.y, md = Math.hypot(mdx, mdy);
      if (md < 190) { ctx.strokeStyle = `rgba(77,227,193,${(1 - md / 190) * .55})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
    }
    for (const rp of ripples) { ctx.strokeStyle = `rgba(77,227,193,${rp.a * .5})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke(); }
    for (const b of bursts) { const s = b.r * 7 * b.life; ctx.globalAlpha = b.life; ctx.drawImage(b.c.img, b.x - s / 2, b.y - s / 2, s, s); }
    ctx.globalAlpha = 1;
    for (const p of particles) {
      let s = p.r * (6.6 + Math.sin(p.tw) * 1.4) * (1 + energy * .55) * (p.hub ? 2 : 1);
      for (const rp of ripples) { const d = Math.abs(Math.hypot(p.x - rp.x, p.y - rp.y) - rp.r); if (d < 60) s *= 1 + (1 - d / 60) * rp.a * 2.2; }
      ctx.drawImage(p.c.img, p.x - s / 2, p.y - s / 2, s, s);
      if (p.hub) { ctx.strokeStyle = `rgba(${p.c.rgb},${.3 + Math.sin(p.tw) * .12})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5.5 + Math.sin(p.tw * .7) * 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (mouse.x > 0) { const cs = 38 + Math.sin(performance.now() / 300) * 7; ctx.drawImage(COLORS[1].img, mouse.x - cs / 2, mouse.y - cs / 2, cs, cs); }
    ctx.globalCompositeOperation = 'source-over';
  }
  resize();
  if (reduced) { step(); draw(); } else (function loop() { step(); draw(); requestAnimationFrame(loop); })();

  /* ---- WebGL fluid (with FPS guard) ---- */
  if (!reduced) {
    try {
      const cvs = document.createElement('canvas'); cvs.id = 'v4-gl';
      document.getElementById('v4-nebula').after(cvs);
      const gl = cvs.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
      if (gl) {
        const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
        const FS = `precision mediump float;uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;uniform float u_mstr;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;vec2 p=uv*vec2(u_res.x/u_res.y,1.)*2.2;float t=u_time*.06;
vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));vec2 r=vec2(fbm(p+2.6*q+vec2(1.7,9.2)+t*1.4),fbm(p+2.6*q+vec2(8.3,2.8)-t));float f=fbm(p+2.4*r);
vec3 col=mix(vec3(.024,.024,.07),vec3(.30,.24,.72),smoothstep(.25,.85,f));col=mix(col,vec3(.16,.62,.53),smoothstep(.45,.95,length(q)*.7)*.6);col=mix(col,vec3(.62,.25,.55),smoothstep(.6,1.,r.x*f)*.35);
vec2 m=u_mouse*vec2(u_res.x/u_res.y,1.);vec2 pm=uv*vec2(u_res.x/u_res.y,1.);float d=distance(pm,m);float rip=sin(d*26.-u_time*4.5)*exp(-d*7.)*u_mstr;
col+=vec3(.3,.9,.75)*max(rip,0.)*.5;col+=vec3(.45,.4,1.)*exp(-d*9.)*u_mstr*.22;float vig=1.-dot(uv-.5,uv-.5)*1.1;gl_FragColor=vec4(col*vig,vig);}`;
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
        const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
        if (vs && fs) {
          const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
          if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            gl.useProgram(prog);
            const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            const U = n => gl.getUniformLocation(prog, n);
            const uRes = U('u_res'), uTime = U('u_time'), uMouse = U('u_mouse'), uMstr = U('u_mstr');
            const SC = .5;
            const size = () => { cvs.width = innerWidth * SC; cvs.height = innerHeight * SC; cvs.style.width = innerWidth + 'px'; cvs.style.height = innerHeight + 'px'; gl.viewport(0, 0, cvs.width, cvs.height); };
            size(); addEventListener('resize', size);
            const mo = { x: .5, y: .5, tx: .5, ty: .5, str: 0 };
            addEventListener('mousemove', e => { mo.tx = e.clientX / innerWidth; mo.ty = 1 - e.clientY / innerHeight; mo.str = Math.min(1, mo.str + .25); }, { passive: true });
            let fr = 0, t0 = performance.now(), dead = false, raf; const tS = t0;
            (function loop(now) {
              if (dead) return;
              fr++;
              if (now - t0 > 3000) { const fps = fr / ((now - t0) / 1000); if (now - tS > 4000 && fps < 38) { dead = true; cancelAnimationFrame(raf); cvs.remove(); return; } fr = 0; t0 = now; }
              mo.x += (mo.tx - mo.x) * .07; mo.y += (mo.ty - mo.y) * .07; mo.str *= .96;
              gl.uniform2f(uRes, cvs.width, cvs.height); gl.uniform1f(uTime, now / 1000); gl.uniform2f(uMouse, mo.x, mo.y); gl.uniform1f(uMstr, mo.str);
              gl.drawArrays(gl.TRIANGLES, 0, 3); raf = requestAnimationFrame(loop);
            })(t0);
          }
        }
      }
    } catch (e) { /* fluid optional */ }
  }

  /* ---- loader (once per session) ---- */
  const _seenLoader = sessionStorage.getItem('v4_loader_seen');
  const loader = document.createElement('div');
  loader.id = 'v4-loader';
  loader.innerHTML = '<img src="/assets/logo-gate.png" alt="" onerror="this.style.display=\'none\'"><div class="l-label">Initializing neural field</div><div class="l-count">0</div><div class="l-bar"><i></i></div>';
  if (_seenLoader) { loader.remove(); }
  else {
  sessionStorage.setItem('v4_loader_seen', '1');
  document.body.appendChild(loader);
  const lc = loader.querySelector('.l-count'), lb = loader.querySelector('.l-bar i');
  let p = 0; const t0 = performance.now();
  (function lt() {
    const el = performance.now() - t0;
    p = Math.min(100, Math.round((el / 1400) * 100 * (0.4 + Math.random() * 0.6)));
    if (el > 1400) p = 100;
    lc.textContent = p; lb.style.transform = `scaleX(${p / 100})`;
    if (p < 100) requestAnimationFrame(lt); else setTimeout(() => { loader.classList.add('done'); document.body.classList.add('loaded'); }, 200);
  })();
  }

  if (_seenLoader) document.body.classList.add('loaded');

  /* ---- custom cursor ---- */
  if (!matchMedia('(hover:none)').matches) {
    const dot = document.createElement('div'); dot.id = 'v4-cdot';
    const ring = document.createElement('div'); ring.id = 'v4-cring';
    document.body.append(dot, ring);
    let cx = -100, cy = -100, rx = -100, ry = -100;
    addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; }, { passive: true });
    (function cl() { rx += (cx - rx) * .16; ry += (cy - ry) * .16; dot.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`; ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`; requestAnimationFrame(cl); })();
    document.querySelectorAll('a,button,input,textarea,select,[data-hover]').forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('v4-hot'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('v4-hot'));
    });
  }

  /* ---- reveal system ---- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .16 });
  document.querySelectorAll('[data-v4-reveal]').forEach(el => io.observe(el));
})();
