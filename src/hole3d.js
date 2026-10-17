/* ---------------- the hole window ----------------
 *
 * The ground of one hole, stood up and lit, with the yardages laid over it.
 * Built from a holes3d model with the 3D library; the book hands it a mount
 * to live in and talks to it through the handful of calls at the foot.
 *
 * It is a LIVE thing, and the book redraws its whole page every few seconds
 * off the shared store. So the canvas is never rebuilt on a redraw: the book
 * keeps the controller and moves its element into the new mount (see
 * mountHole3D in app.js), which costs nothing and keeps the WebGL context,
 * the camera and wherever the golfer had dragged to.
 *
 * One finger drags along the hole, two pinch, a tap puts the target down.
 * Everything drawn over the ground — the pins, the cards, the dot — is HTML
 * placed by projecting a point through the camera after every render, so
 * it is crisp at any zoom and reads like the rest of the book.
 *
 * The same ground is also drawn ONCE, still, for the plate on every scoring
 * screen (snapshot below): the plate is a picture, so it costs nothing on
 * the redraws, and the window is the live one.
 */
import * as H from './holes3d.js';

export function available() {
  if (typeof window === 'undefined' || !window.THREE) return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

const fmt = (metres, units) => String(Math.round(units === 'yd' ? metres * H.YARDS : metres));

/* How far back the camera stands to take in the whole hole: a zoom of one
   shows about 230 metres of ground on a phone. */
const fitZoom = (LEN, aspect) => Math.max(1, Math.min(3.6, LEN / 230 * 1.08 * Math.max(1, (0.5 / aspect))));

/* ---- the ground ---- */
function buildScene(m) {
  const T3 = window.THREE;
  const DS = T3.DoubleSide;
  const raw = m.cl.map(([x, z]) => new T3.Vector3(x, 0, z));
  const CL = new T3.CatmullRomCurve3(raw);
  const k = m.len / CL.getLength();
  raw.forEach(p => p.multiplyScalar(k)); CL.updateArcLengths();
  const LEN = CL.getLength();
  const at = t => t < 0 ? CL.getPointAt(0).add(CL.getTangentAt(0).multiplyScalar(t * LEN))
           : t > 1 ? CL.getPointAt(1).add(CL.getTangentAt(1).multiplyScalar((t - 1) * LEN))
           : CL.getPointAt(t);
  const tan = t => CL.getTangentAt(Math.max(0, Math.min(1, t)));
  const nrm = t => { const g = tan(t); return new T3.Vector3(-g.z, 0, g.x); };
  const side = (t, d) => at(t).add(nrm(t).multiplyScalar(d));
  let seed = m.seed || 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const geos = [], mats = [];
  const G = g => { geos.push(g); return g; };
  const M = mt => { mats.push(mt); return mt; };

  function ribbon(w0, w1, t0, t1, n = 40) {
    const L = [], R = [];
    for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; const w = w0 + (w1 - w0) * (i / n) * (1 - (i / n) * .25);
      L.push(side(t, -w)); R.push(side(t, w)); }
    const s = new T3.Shape(); s.moveTo(L[0].x, L[0].z); L.forEach(p => s.lineTo(p.x, p.z));
    R.reverse().forEach(p => s.lineTo(p.x, p.z)); s.closePath(); return s;
  }
  function islandShape() {
    const pts = [], n = 26, t0 = -0.03, t1 = 1.03;
    const W = t => 62 + 8 * t + 10 * (Math.sin(t * 8.3) * .6 + Math.sin(t * 15.7 + 1) * .4);
    for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; pts.push(side(t, -W(t))); }
    { const c = at(t1), g = tan(t1), nn = nrm(t1), R = W(t1);
      for (let j = 1; j < 8; j++) { const a = Math.PI - Math.PI * j / 8; pts.push(c.clone().add(nn.clone().multiplyScalar(Math.cos(a) * R)).add(g.clone().multiplyScalar(Math.sin(a) * R * .8))); } }
    for (let i = n; i >= 0; i--) { const t = t0 + (t1 - t0) * i / n; pts.push(side(t, W(t))); }
    { const c = at(t0), g = tan(t0), nn = nrm(t0), R = W(t0);
      for (let j = 1; j < 8; j++) { const a = -Math.PI * j / 8; pts.push(c.clone().add(nn.clone().multiplyScalar(Math.cos(a) * R)).add(g.clone().multiplyScalar(Math.sin(a) * R * .8))); } }
    const v2 = pts.map(p => new T3.Vector2(p.x, p.z));
    const s = new T3.Shape(); s.moveTo(v2[0].x, v2[0].y); s.splineThru(v2.slice(1).concat([v2[0]])); return s;
  }
  function flat(shape, color, y, map) {
    const g = G(new T3.ShapeGeometry(shape, 24)); g.rotateX(Math.PI / 2);
    const mesh = new T3.Mesh(g, M(new T3.MeshLambertMaterial({ color, map: map || null, side: DS })));
    mesh.position.y = y; mesh.receiveShadow = true; return mesh;
  }
  function ellipse(cx, cz, rx, rz, rot) {
    const s = new T3.Shape(); s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const g = G(new T3.ShapeGeometry(s, 32)); g.rotateZ(rot || 0); g.rotateX(Math.PI / 2); g.translate(cx, 0, cz); return g;
  }
  function pad(t, d, w, l, r, color, y) {
    const p = side(t, d), g = tan(t), a = Math.atan2(g.x, g.z);
    const s = new T3.Shape();
    s.moveTo(-w / 2 + r, -l / 2); s.lineTo(w / 2 - r, -l / 2); s.absarc(w / 2 - r, -l / 2 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(w / 2, l / 2 - r); s.absarc(w / 2 - r, l / 2 - r, r, 0, Math.PI / 2, false); s.lineTo(-w / 2 + r, l / 2);
    s.absarc(-w / 2 + r, l / 2 - r, r, Math.PI / 2, Math.PI, false); s.lineTo(-w / 2, -l / 2 + r); s.absarc(-w / 2 + r, -l / 2 + r, r, Math.PI, Math.PI * 1.5, false);
    const geo = G(new T3.ShapeGeometry(s, 10)); geo.rotateZ(-a); geo.rotateX(Math.PI / 2); geo.translate(p.x, 0, p.z);
    const mesh = new T3.Mesh(geo, M(new T3.MeshLambertMaterial({ color, side: DS }))); mesh.position.y = y; mesh.receiveShadow = true; return mesh;
  }
  function stripes() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#86CB45'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#76BC39'; x.fillRect(0, 0, 64, 32);
    const t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; t.wrapS = t.wrapT = T3.RepeatWrapping; t.repeat.set(1 / 22, 1 / 22); return t;
  }

  const sc = new T3.Scene();
  sc.add(new T3.HemisphereLight(0xdfeeff, 0x4e7a2e, 1.05));
  const sun = new T3.DirectionalLight(0xfff4e0, 1.35); sun.position.set(-160, 260, -40); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 80, bottom: -LEN - 80, near: 10, far: 900 });
  sun.target.position.set(0, 0, -LEN / 2); sc.add(sun.target);
  sun.shadow.bias = -0.0008; sc.add(sun);

  const eg = G(new T3.ExtrudeGeometry(islandShape(), { depth: 14, bevelEnabled: true, bevelThickness: 7, bevelSize: 9, bevelSegments: 4, curveSegments: 40 }));
  eg.rotateX(Math.PI / 2);
  const island = new T3.Mesh(eg, M(new T3.MeshLambertMaterial({ color: 0x6FB83A }))); island.position.y = -7.1; island.receiveShadow = true; island.castShadow = true;
  const sides = new T3.Mesh(eg, M(new T3.MeshLambertMaterial({ color: 0x4F8C2A }))); sides.position.y = -7.4; sides.scale.set(.995, 1, .995); sc.add(sides); sc.add(island);

  const tex = stripes();
  sc.add(flat(ribbon(m.fw.w0, m.fw.w1, m.fw.t0, m.fw.t1), 0xffffff, .25, tex));
  sc.add(pad(0.025, 0, 15, 26, 5, 0xB9E67A, .3));
  const tp = side(0.012, 0);
  { const coin = new T3.Group();
    const ring = new T3.Mesh(G(new T3.CylinderGeometry(2.8, 2.8, .5, 28)), M(new T3.MeshLambertMaterial({ color: 0xF6F6F3 }))); ring.position.y = .55; coin.add(ring);
    const disc = new T3.Mesh(G(new T3.CylinderGeometry(2.0, 2.0, .3, 28)), M(new T3.MeshLambertMaterial({ color: 0x8E949A }))); disc.position.y = .85; coin.add(disc);
    coin.position.set(tp.x, 0, tp.z); sc.add(coin); }

  const gC = at(m.green.t), gr = tan(m.green.t), ga = Math.atan2(gr.x, gr.z);
  const fringe = new T3.Mesh(ellipse(gC.x, gC.z, m.green.rx + 4, m.green.rz + 3.5, ga), M(new T3.MeshLambertMaterial({ color: 0x8CD14A, side: DS }))); fringe.position.y = .3; fringe.receiveShadow = true; sc.add(fringe);
  const green = new T3.Mesh(ellipse(gC.x, gC.z, m.green.rx, m.green.rz, ga), M(new T3.MeshLambertMaterial({ color: 0xB2E86F, side: DS }))); green.position.y = .4; green.receiveShadow = true; sc.add(green);
  { const pole = new T3.Mesh(G(new T3.CylinderGeometry(.25, .25, 7, 6)), M(new T3.MeshLambertMaterial({ color: 0xf4f4f4 }))); pole.position.set(gC.x + 2, 3.5, gC.z); sc.add(pole);
    const flag = new T3.Mesh(G(new T3.PlaneGeometry(4, 2.4)), M(new T3.MeshLambertMaterial({ color: 0xD9342B, side: DS }))); flag.position.set(gC.x + 4, 6, gC.z); flag.castShadow = true; sc.add(flag);
    const cup = new T3.Mesh(G(new T3.CircleGeometry(.8, 12)), M(new T3.MeshBasicMaterial({ color: 0x1D2E21 }))); cup.rotation.x = -Math.PI / 2; cup.position.set(gC.x + 2, .45, gC.z); sc.add(cup); }

  const sand = M(new T3.MeshLambertMaterial({ color: 0xEBDDB3, side: DS }));
  const lipM = M(new T3.MeshLambertMaterial({ color: 0x5E9A33, side: DS }));
  const bunkerPts = m.bunkers.map(b => { const p = side(b.t, b.d);
    const lip = new T3.Mesh(ellipse(p.x, p.z, b.rx + 1.2, b.rz + 1.2, 0), lipM); lip.position.y = .32; sc.add(lip);
    const mesh = new T3.Mesh(ellipse(p.x, p.z, b.rx, b.rz, rnd() * 1.2), sand); mesh.position.y = .35; mesh.receiveShadow = true; sc.add(mesh); return p; });

  const greens = [0x3F7D2B, 0x4E9A33, 0x5FAE3F, 0x2F6A24];
  const trunkM = M(new T3.MeshLambertMaterial({ color: 0x6E4B2A }));
  const canopyM = greens.map(c => M(new T3.MeshLambertMaterial({ color: c, flatShading: true })));
  const canopyG = [4.6, 3.7, 2.8].map(r => G(new T3.IcosahedronGeometry(r, 1)));
  const trunkG = G(new T3.CylinderGeometry(.5, .7, 5, 6));
  function tree(x, z, s) {
    const g = new T3.Group();
    const trunk = new T3.Mesh(trunkG, trunkM); trunk.position.y = 2.5 * s; trunk.scale.setScalar(s); trunk.castShadow = true; g.add(trunk);
    const mat = canopyM[Math.floor(rnd() * canopyM.length)];
    for (let i = 0; i < 3; i++) { const c = new T3.Mesh(canopyG[i], mat); c.scale.setScalar(s);
      c.position.set((rnd() - .5) * 2 * s, 5 * s + i * 2.6 * s, (rnd() - .5) * 2 * s); c.castShadow = true; c.receiveShadow = true; g.add(c); }
    g.position.set(x, 0, z); g.rotation.y = rnd() * 6; sc.add(g);
  }
  const nTrees = m.trees || 60;
  for (let i = 0; i < nTrees * .75; i++) { const t = 0.04 + rnd() * .9; const d = (rnd() < .5 ? -1 : 1) * (30 + rnd() * 36); const p = side(t, d); tree(p.x, p.z, .85 + rnd() * .7); }
  for (let i = 0; i < nTrees * .25; i++) { const t = rnd() * .25; const d = (rnd() < .5 ? -1 : 1) * (14 + rnd() * 28); const p = side(t + .72, d); tree(p.x, p.z, .8 + rnd() * .5); }

  const points = { tee: tp, gMid: gC, gFront: gC.clone().sub(gr.clone().multiplyScalar(m.green.rz)), gBack: gC.clone().add(gr.clone().multiplyScalar(m.green.rz)), bunkers: bunkerPts };
  /* where the camera stands for a focus along the line, a zoom and a tilt */
  function aim(cam, focus, ox, zoom, flatView) {
    const f = at(focus).add(nrm(focus).multiplyScalar(ox)), g = tan(focus);
    if (flatView) { cam.position.set(f.x, 420 * zoom, f.z); cam.up.copy(g); cam.lookAt(f.x, 0, f.z); }
    else { cam.up.set(0, 1, 0); cam.position.set(f.x - g.x * 200 * zoom, 300 * zoom, f.z - g.z * 200 * zoom); cam.lookAt(f.x + g.x * 50, -20, f.z + g.z * 50); }
  }
  const dispose = () => { geos.forEach(g => g.dispose()); mats.forEach(mt => mt.dispose()); tex.dispose(); };
  return { sc, at, tan, nrm, side, LEN, points, aim, dispose };
}

/* ---- the plate's picture ----
   The whole hole, taken from behind the tee, on a clear ground so it sits
   on whatever the plate is painted. Drawn once per hole and kept by the
   book; one offscreen renderer serves them all. */
let snapR = null;
/** `across` lays the hole left to right — tee on the left — for a plate
 *  that is wider than it is tall. */
export function snapshot(m, w = 520, h = 650, across = false) {
  const T3 = window.THREE;
  if (!snapR) {
    const c = document.createElement('canvas');
    snapR = new T3.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapR.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    snapR.shadowMap.enabled = true; snapR.shadowMap.type = T3.PCFSoftShadowMap; snapR.outputColorSpace = T3.SRGBColorSpace;
  }
  snapR.setSize(w, h, false);
  const S = buildScene(m);
  const cam = new T3.PerspectiveCamera(44, w / h, 1, 4000);
  if (across) {
    /* the same stand behind the tee, the camera rolled a quarter turn so the
       hole runs along the long side of the picture */
    const z = Math.max(1, Math.min(3.6, S.LEN / 230 * 1.08 * (h / w) * 0.92));
    const f = S.at(0.5), g = S.tan(0.5), n = S.nrm(0.5);
    cam.position.set(f.x - g.x * 200 * z, 300 * z, f.z - g.z * 200 * z);
    cam.up.copy(n).negate(); cam.lookAt(f.x + g.x * 50, -20, f.z + g.z * 50);
  } else S.aim(cam, 0.5, 0, fitZoom(S.LEN, w / h) * 0.9, false);
  snapR.render(S.sc, cam);
  const url = snapR.domElement.toDataURL('image/png');
  S.dispose();
  return url;
}

export function create(mount, m, opts = {}) {
  const T3 = window.THREE;
  const S = buildScene(m);
  const { at, nrm, LEN, points } = S;
  const tp = points.tee, bunkerPts = points.bunkers;
  const state = { units: opts.units || 'yd', me: opts.me || null, flat: !!opts.flat, labels: opts.labels !== false,
    focus: 0.5, zoom: 1, ox: 0, target: null, dirty: true, dead: false };

  const el = document.createElement('div'); el.className = 'h3live';
  const canvas = document.createElement('canvas'); canvas.className = 'h3canvas'; el.appendChild(canvas);
  const layer = document.createElement('div'); layer.className = 'h3layer'; el.appendChild(layer);
  const r = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true; r.shadowMap.type = T3.PCFSoftShadowMap; r.outputColorSpace = T3.SRGBColorSpace;
  const cam = new T3.PerspectiveCamera(44, 1, 1, 4000);
  const ground = new T3.Plane(new T3.Vector3(0, 1, 0), 0);
  const ray = new T3.Raycaster();
  let W = 1, Hh = 1, fitted = false;

  function resize() {
    const w = el.clientWidth || mount.clientWidth || 360, h = el.clientHeight || mount.clientHeight || 640;
    if (w === W && h === Hh) return;
    W = w; Hh = h; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); state.dirty = true;
    /* it opens on the whole hole, once the glass's shape is known */
    if (!fitted) { fitted = true; state.zoom = fitZoom(LEN, w / h); state.focus = 0.5; }
  }
  const proj = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * Hh, on: p.z < 1 }; };

  const mk = (cls) => { const e = document.createElement('div'); e.className = cls; layer.appendChild(e); return e; };
  const gcard = mk('h3gcard'), tgt = mk('h3tgt'), tcard = mk('h3tcard'), me = mk('h3me'), gline = mk('h3gline');
  const bpins = bunkerPts.map(() => mk('h3pin'));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function from() { return state.me ? new T3.Vector3(state.me.x, 0, state.me.z) : tp; }
  function place(e, q, dy, show) {
    if (!show || !q.on || q.x < -80 || q.x > W + 80 || q.y < -120 || q.y > Hh + 60) { e.style.display = 'none'; return; }
    e.style.display = ''; e.style.left = Math.max(60, Math.min(W - 60, q.x)) + 'px'; e.style.top = (q.y + dy) + 'px';
  }
  function dress() {
    const u = state.units, o = from();
    gcard.innerHTML = `<div><i>${fmt(dist(o, points.gFront), u)}</i><small>Front</small></div><div><b>${fmt(dist(o, points.gMid), u)}</b><small>Middle</small></div><div><i>${fmt(dist(o, points.gBack), u)}</i><small>Back</small></div>`;
    bpins.forEach((e, i) => { e.textContent = fmt(dist(o, bunkerPts[i]), u); });
    if (state.target) tcard.innerHTML = `<small>${fmt(dist(state.target, points.gMid), u)} to the green</small><b>${fmt(dist(o, state.target), u)}</b>`;
  }
  function lay() {
    const show = state.labels;
    const qg = proj(points.gMid);
    const parked = qg.on && qg.y < 60;
    /* the green off the top: the card parks under the unit pill, between
       the rails, so the three numbers never leave the glass */
    if (parked) { gcard.style.display = show ? '' : 'none'; gcard.style.left = (W / 2) + 'px'; gcard.style.top = '232px'; gline.style.display = 'none'; }
    else { place(gcard, qg, -40, show); gline.style.display = gcard.style.display; gline.style.left = qg.x + 'px'; gline.style.top = (qg.y - 40) + 'px'; }
    bpins.forEach((e, i) => place(e, proj(bunkerPts[i]), -2, show));
    if (state.target) { const q = proj(state.target); place(tgt, q, 0, true); place(tcard, q, -12, show); }
    else { tgt.style.display = 'none'; tcard.style.display = 'none'; }
    place(me, proj(from()), 0, !!state.me);
  }
  let raf = 0;
  function loop() {
    raf = 0; if (state.dead) return;
    resize(); if (!state.dirty) return;
    state.dirty = false; S.aim(cam, state.focus, state.ox, state.zoom, state.flat); r.render(S.sc, cam); lay();
  }
  function touch() { state.dirty = true; if (!raf) raf = requestAnimationFrame(loop); }

  /* ---- fingers ---- */
  const ptrs = new Map(); let pinch0 = 0, zoom0 = 1, moved = 0, downAt = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = 0; downAt = Date.now(); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = state.zoom; } });
  el.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      /* a screen's worth of drag is about 230 metres of hole at zoom one */
      state.focus = Math.max(-0.08, Math.min(1.08, state.focus + (dy / Hh) * 230 * state.zoom / LEN));
      state.ox = Math.max(-70, Math.min(70, state.ox - (dx / W) * 150 * state.zoom));
      touch();
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) { state.zoom = Math.max(.45, Math.min(3.6, zoom0 * pinch0 / d)); touch(); }
    }
  });
  const up = e => { const was = ptrs.size; ptrs.delete(e.pointerId);
    if (was === 1 && moved < 8 && Date.now() - downAt < 400) tap(e); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  function tap(e) {
    const b = el.getBoundingClientRect();
    ray.setFromCamera(new T3.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), cam);
    const hit = new T3.Vector3(); if (!ray.ray.intersectPlane(ground, hit)) return;
    state.target = state.target && dist(state.target, hit) < 6 ? null : hit;   // a tap on the target lifts it
    dress(); touch();
    if (opts.onTarget) opts.onTarget(state.target);
  }
  el.addEventListener('wheel', e => { e.preventDefault(); state.zoom = Math.max(.45, Math.min(3.6, state.zoom * (e.deltaY > 0 ? 1.08 : .93))); touch(); }, { passive: false });

  mount.appendChild(el);
  dress(); touch();

  return {
    el, model: m, points, state,
    setUnits(u) { state.units = u === 'm' ? 'm' : 'yd'; dress(); touch(); },
    setMe(p) { state.me = p || null; dress(); touch(); },
    setFlat(b) { state.flat = !!b; touch(); },
    setLabels(b) { state.labels = b !== false; touch(); },
    focusMe() { const o = from(); let best = 0, bd = 1e9; for (let i = 0; i <= 50; i++) { const d = dist(at(i / 50), o); if (d < bd) { bd = d; best = i / 50; } } state.focus = best; state.ox = 0; state.zoom = 1; touch(); },
    fit() { state.focus = 0.5; state.ox = 0; state.zoom = fitZoom(LEN, W / Hh); touch(); },
    refresh() { W = 0; touch(); },
    dispose() { state.dead = true; if (raf) cancelAnimationFrame(raf); try { r.dispose(); S.dispose(); } catch (e) { /* already gone */ } if (el.parentNode) el.parentNode.removeChild(el); },
  };
}
