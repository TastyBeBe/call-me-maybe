// @ts-nocheck
/*
 * PROCOP THE PIG — the Kick-the-Procop runtime ported into Call Me Maybe as a full-window
 * transparent canvas layer. Ported from ~/Gamesky/procop-pig/game/template.html (v17):
 * the animator transform, walk/idle/wave AI, grab/throw/hit physics, per-part alpha hitboxes,
 * damage stages, death + angel + respawn, party dances. What is NEW here:
 *   - WALLS: every piece of UI is a solid rectangle (fed in by the DOM collector), with the
 *     game's wall/roof/floor collision applied to each one; an INVISIBLE FLOOR at the bottom.
 *   - ON/OFF, walk-in on page load / tab change, "visitor" dances while he is off.
 *   - the magic crystal -> HYPER (runs, bounces, follows the crystal cursor, then dies).
 * Physics/animation numbers are the game's; the tool shapes are its own. Kept in plain JS
 * shape (ts-nocheck) — this is verified game code, not app logic.
 */

const T = (x, y) => [1, 0, x, 0, 1, y], SCL = (kx, ky) => [kx, 0, 0, 0, ky, 0];
function mul(A, B) { return [A[0]*B[0]+A[1]*B[3], A[0]*B[1]+A[1]*B[4], A[0]*B[2]+A[1]*B[5]+A[2],
                             A[3]*B[0]+A[4]*B[3], A[3]*B[1]+A[4]*B[4], A[3]*B[2]+A[4]*B[5]+A[5]]; }
function ROT(d, px = 0, py = 0) { const t = d*Math.PI/180, c = Math.cos(t), s = Math.sin(t);
  return mul(T(px, py), mul([c, -s, 0, s, c, 0], T(-px, -py))); }
function inv(m) { const det = m[0]*m[4]-m[1]*m[3];
  return [m[4]/det, -m[1]/det, (m[1]*m[5]-m[4]*m[2])/det, -m[3]/det, m[0]/det, (m[3]*m[2]-m[0]*m[5])/det]; }
const apply = (m, x, y) => [m[0]*x+m[1]*y+m[2], m[3]*x+m[4]*y+m[5]];
const sc2 = p => Array.isArray(p.scale) ? p.scale : [p.scale, p.scale];
const pick = a => a[Math.floor(Math.random()*a.length)];

export const TOOLS = [
  { id: 'hand',     nm: 'ruka',         kind: 'hand',  img: 'hand_open' },
  { id: 'suk',      nm: 'sojový suk',   kind: 'food',  img: 'suk' },
  { id: 'glove',    nm: 'rukavice',     kind: 'punch', img: 'weapon_glove',    dmg: 22, force: 520,  fx: 'e_slap',      snd: 'hit_soft',   stop: .06 },
  { id: 'bat',      nm: 'pálka',        kind: 'swing', img: 'weapon_bat',      dmg: 30, force: 700,  fx: 'e_ringburst', snd: 'hit_bat',    stop: .07 },
  { id: 'pan',      nm: 'pánev',        kind: 'swing', img: 'weapon_pan',      dmg: 28, force: 620,  fx: 'e_clang',     snd: 'pan_clang',  stop: .06 },
  { id: 'hammer',   nm: 'kladivo',      kind: 'swing', img: 'weapon_hammer',   dmg: 38, force: 820,  fx: 'e_crush',     snd: 'hit_hammer', stop: .08 },
  { id: 'knife',    nm: 'nůž',          kind: 'cut',   img: 'weapon_knife',    dmg: 26, force: 380,  fx: 'e_slash',     snd: 'slash' },
  { id: 'whip',     nm: 'bič',          kind: 'whip',  img: 'weapon_whip',     dmg: 24, force: 900,  fx: 'e_welt',      snd: 'whip_hit' },
  { id: 'chainsaw', nm: 'motorovka',    kind: 'saw',   img: 'weapon_chainsaw', dmg: 6,  force: 120,  fx: 'e_sputter',   snd: 'hit_soft' },
  { id: 'grenade',  nm: 'granát',       kind: 'throw', img: 'weapon_grenade',  dmg: 90, force: 1100, fx: 'e_boom',      snd: 'explosion',  stop: .09 },
  { id: 'crystal',  nm: 'magický krystal', kind: 'crystal', img: 'weapon_crystal' },
];
export const DANCES = ['dance_wave', 'dance_ovcacek', 'dance_buckbuck', 'dance_twerk', 'dance_handstand', 'dance_ultratwerk'];

// sprite px contact points (measured on the art, v6) — the same transform draws and tests
const WCONTACT = { glove: [[125,18],[80,32],[170,32]], bat: [[212,28],[185,50],[228,18]],
  pan: [[140,80],[140,20],[140,140],[80,80],[200,80]], knife: [[205,42],[234,6],[160,88]],
  hammer: [[95,48],[111,31],[57,96]], chainsaw: [[232,18],[195,24],[155,40]] };

const STAGES = [
  {}, { head: 'blush', bubble: 'Hihi!' }, { head: 0, bubble: 'Hej! To už nebylo milé!' }, { body: 1 },
  { head: 1, bubble: 'Ne! Moje brýle!' }, {}, { body: 2 }, { head: 2, bubble: 'Au, moje oko…' }, {},
  { body: 3 }, {}, { head: 3, bubble: 'oink… :(' }, { bubble: 'Kvíííík…' }, { bubble: '…' }, { bubble: 'oink.' },
];
const JMUL = { head: .7, tail: 1.5, leg_FN: 1.1, leg_FF: 1.1, leg_BN: 1.1, leg_BF: 1.1, teat_A: 3.4, teat_B: 3.2, teat_C: 3.6, body: 0, hat: 0 };
const JMAX = { head: 13, tail: 20, leg_FN: 22, leg_FF: 22, leg_BN: 22, leg_BF: 22, teat_A: 44, teat_B: 44, teat_C: 44, body: 0, hat: 0 };
const JK = { teat_A: 26, teat_B: 24, teat_C: 28, tail: 34 };
const CONF_COLS = ['#E8593F', '#F2B449', '#3FB8E8', '#7BD34A', '#C65CE8', '#FF7AB6'];
// #1 SELLER confetti: gold AND black (his ask)
const GOLD_COLS = ['#F2B449', '#141118', '#E8B33F', '#2B2622', '#FFE08A', '#0E0C11', '#C9942B', '#1B1720'];
const HYPER_DUR = 60;                 // seconds of running before the sugar kills him
const WALK_SPEED = 150;               // rig px/s, the game's stroll (the walk clip is authored at this rate)
const WALKIN_SPEED = 480;             // rig px/s for the entrance / exit; the walk clip plays proportionally faster

/** Only ONE runtime may ever be live: a second instance (StrictMode's double mount, an HMR
 *  reload, a fast re-login) kept ticking on the same canvas and drew a SECOND pig. */
let LIVE = null;

export class PigRuntime {
  // public state the React layer reads (declared so the type carries them; assigned in the constructor)
  dead: any; party: any; visit: any; enter: any; hyper: any; pendingDance: any; enabled: boolean; shown: boolean; tool: any; dmg: number; ghost: boolean; showWalls: boolean; roam: any; ballistic: boolean; cos: any; flee: number; reveal: any; goldParty: boolean; IMG: any; walls: any;
  constructor(cv, opts = {}) {
    if (LIVE && LIVE !== this) { try { LIVE.destroy(); } catch (e) { /* already gone */ } }
    LIVE = this;
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.base = opts.base || '/pig/';
    this.scale = opts.scale || 0.16;                       // css px per rig px
    this.sfxOn = opts.sfxOn || (() => true);
    this.sfxVol = opts.sfxVol || (() => 1);   // vlastní posuvník hlasitosti Procopa
    this.listeners = {};
    this.IMG = {}; this.SND = {}; this.SPOOL = {}; this.MASK = {};
    this.walls = [];                                       // device px rects {x,y,w,h}
    this.enabled = true; this.shown = true;
    this.tool = null; this.visit = null; this.hyper = null;
    this.W = 0; this.H = 0; this.DPR = 1; this.GS = 0.16; this.FLOOR = 0;
    this.P = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, rvel: 0, facing: 1, sqx: 1, sqy: 1, ground: 0 };
    this.mx = -9999; this.my = -9999; this.mdown = false; this.grab = null; this.hist = []; this.PBUF = [];
    this.strike = null; this.held = false; this.sprawl = 0; this.sawJit = 0; this.eat = null;
    this.dead = null; this.pigAlpha = 1; this.angel = null; this.party = null; this.confetti = [];
    this.anim = 'idle'; this.frame = 0; this.oneshot = null; this.aiTimer = 2; this.mode = 'idle';
    this.dmg = 0; this.headState = 0; this.bodyState = 0; this.blushUntil = 0;
    this.partDmg = {}; this.partState = {}; this.jig = {}; this.jigv = {};
    this.bubble = null; this.parts = []; this.fxs = []; this.glows = []; this.hitstop = 0; this.shake = 0;
    this.lastHitPart = 'body'; this._seq = 0; this._mc = null; this.enter = null; this.lastTouch = 0;
    this.IS = 1; this.ghost = false; this.roam = null; this.showWalls = false; this.ballistic = false; this.reenterAfter = false; this.stuckFrames = 0; this._ghostT = 0;
    this.flee = 0; this.fleeFrom = 0; this.rotTarget = 0; this.cos = null; this.reveal = null; this.goldParty = false; this._evict = 0; this._inWin = true;
    this.tick = this.tick.bind(this); this.running = false; this.destroyed = false;
    this._onMove = e => this.onMove(e); this._onDown = e => this.onDown(e); this._onUp = () => this.onUp();
    this._onResize = () => this.resize();
  }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return () => { this.listeners[ev] = (this.listeners[ev] || []).filter(f => f !== fn); }; }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }

  // ---------- assets ----------
  async load() {
    // no-store: the browser heuristically cached manifest.json and a re-export never showed up
    const [rig, man] = await Promise.all([fetch(this.base + 'rig.json', { cache: 'no-store' }).then(r => r.json()), fetch(this.base + 'manifest.json', { cache: 'no-store' }).then(r => r.json())]);
    this.RIG = rig; this.BPOS = rig.parts.body.pos;
    for (const n in rig.parts) { this.jig[n] = 0; this.jigv[n] = 0; }
    const loads = [];
    for (const k in man.images) { const im = new Image(); im.src = this.base + man.images[k]; this.IMG[k] = im;
      loads.push(new Promise(res => { im.onload = res; im.onerror = res; })); }
    for (const k in man.sounds) { const a = new Audio(this.base + man.sounds[k]); a.preload = 'auto'; this.SND[k] = a; }
    await Promise.all(loads);
    // PROPS: worn parts - never hit-tested, never jiggled. `hat` is the party hat; every `cos_*`
    // part is a closet cosmetic, worn only while it is the selected one. A party always puts the
    // party hat on, EXCEPT the ULTRA TWERK, which wears the golden #1-seller cap.
    this.PROPS = { hat: () => !!this.party && !this.goldParty };
    for (const n in rig.parts) if (n.startsWith('cos_')) this.PROPS[n] = () => this.wearing() === n;
    this.buildMasks(); this.measureExtent();
    return this;
  }
  measureExtent() {
    // his real silhouette box at rest, in rig px relative to the body pivot (hat excluded)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n in this.RIG.parts) { if (this.PROPS[n]) continue; const p = this.RIG.parts[n], M = this.restM(p);
      for (const [x, y] of [[0, 0], [p.w, 0], [0, p.h], [p.w, p.h]]) { const [X, Y] = apply(M, x, y); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } }
    // tighten with the alpha masks (the part boxes carry transparent margins)
    const g = this.RIG.ground.y;
    this.EXT = { l: x0 - this.BPOS[0], r: x1 - this.BPOS[0], t: y0 - this.BPOS[1], b: g - this.BPOS[1] };
    // trim: measured part boxes overstate him by ~8% each side
    this.EXT.l *= .92; this.EXT.r *= .92; this.EXT.t *= .96;
  }
  start() { if (this.running) return; this.running = true; this.resize();
    addEventListener('resize', this._onResize);
    addEventListener('pointermove', this._onMove); addEventListener('pointerdown', this._onDown, true);
    addEventListener('pointerup', this._onUp);
    this.last = performance.now()/1000; requestAnimationFrame(this.tick); }
  destroy() { this.destroyed = true; this.running = false; this.buzz(false); if (LIVE === this) LIVE = null;
    removeEventListener("resize", this._onResize); removeEventListener('pointerup', this._onUp);
    removeEventListener('pointermove', this._onMove); removeEventListener('pointerdown', this._onDown, true);
    try { document.body.style.cursor = ''; } catch (e) { /* ignore */ } }

  // ---------- animator transform (verbatim port) ----------
  valueAt(animName, part, f) {
    const A = this.RIG.anims[animName], K = (A.keys[part]) || {};
    const idx = Object.keys(K).map(Number).filter(i => i < A.len).sort((a, b) => a-b);
    const out = { x: 0, y: 0, rot: 0, s: 1 };
    for (const c of ['x', 'y', 'rot', 's']) {
      const have = idx.filter(i => K[i][c] !== undefined && K[i][c] !== null);
      if (!have.length) { out[c] = c === 's' ? 1 : 0; continue; }
      if (have.length === 1) { out[c] = K[have[0]][c]; continue; }
      let a = -1, b = -1;
      for (const i of have) if (i <= f) a = i;
      for (let j = have.length-1; j >= 0; j--) if (have[j] >= f) b = have[j];
      if (a === -1) a = have[have.length-1]; if (b === -1) b = have[0];
      let span = b-a; if (span <= 0) span += A.len;
      let t = f-a; if (t < 0) t += A.len;
      const u = span ? t/span : 0, va = K[a][c], vb = K[b][c], ease = K[a].ease || 'ease';
      const w = ease === 'hold' ? 0 : (ease === 'linear' ? u : 0.5-0.5*Math.cos(Math.PI*u));
      out[c] = va+(vb-va)*w;
    }
    return out;
  }
  restM(p) { const piv = p.pivot, [kx, ky] = sc2(p); return mul(T(p.pos[0], p.pos[1]), mul(ROT(p.rot), mul(SCL(kx, ky), T(-piv[0], -piv[1])))); }
  animM(p, v) { const piv = p.pivot, [kx, ky] = sc2(p);
    return mul(T(p.pos[0]+v.x, p.pos[1]+v.y), mul(ROT(p.rot+v.rot), mul(SCL(kx*v.s, ky*v.s), T(-piv[0], -piv[1])))); }
  poseOf(n) { let v = { x: 0, y: 0, rot: 0, s: 1 }; if (this.anim && this.RIG.anims[this.anim]) v = this.valueAt(this.anim, n, this.frame); v.rot += this.jig[n] || 0; return v; }
  chainD(name, depth = 0) { if (!name || depth > 8) return T(0, 0); const p = this.RIG.parts[name]; const v = this.poseOf(name); const vv = { ...v, s: 1 };
    return mul(this.chainD(p.parent, depth+1), mul(this.animM(p, vv), inv(this.restM(p)))); }
  outerM() {
    const { P, W, GS, FLOOR, BPOS, RIG } = this;
    let M = T(W/2+P.x*GS+this.sawJit, P.y*GS);
    M = mul(M, SCL(GS, GS));
    M = mul(M, T(-BPOS[0], FLOOR/GS - RIG.ground.y));
    M = mul(M, ROT(P.rot, BPOS[0], BPOS[1]));
    if (P.sqx !== 1 || P.sqy !== 1) M = mul(M, mul(T(BPOS[0], RIG.ground.y), mul(SCL(P.sqx, P.sqy), T(-BPOS[0], -RIG.ground.y))));
    if (P.facing < 0) M = mul(M, mul(T(BPOS[0], 0), mul(SCL(-1, 1), T(-BPOS[0], 0))));
    return M;
  }
  pigScreen() { return apply(this.outerM(), this.BPOS[0], this.BPOS[1]); }
  headScreen() { const p = this.RIG.parts.head; const M = mul(this.outerM(), mul(this.chainD('body'), this.animM(p, this.poseOf('head')))); return apply(M, p.pivot[0], p.pivot[1]-p.h*0.75); }
  mouthScreen() { const p = this.RIG.parts.head; const M = mul(this.outerM(), mul(this.chainD('body'), this.animM(p, this.poseOf('head')))); return apply(M, 150, 470); }
  toRig(dx, dy) { return apply(inv(this.outerM()), dx, dy); }
  // his silhouette box in DEVICE px (the four corners of the rest-extent box through outerM)
  pigBox() {
    const M = this.outerM(), E = this.EXT, B = this.BPOS; if (!E) return { x: 0, y: 0, w: 0, h: 0 }; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [dx, dy] of [[E.l, E.t], [E.r, E.t], [E.l, E.b], [E.r, E.b]]) { const [X, Y] = apply(M, B[0]+dx, B[1]+dy); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    return { x: x0, y: y0, w: x1-x0, h: y1-y0 };
  }

  // ---------- hit test: per-part alpha masks ----------
  partImgKey(n) { if (n === 'head') return 'head_state_0'; if (n === 'body') return 'body_state_0'; return this.RIG.parts[n].key; }
  buildMask(k) { const im = this.IMG[k]; if (!im || !im.width || this.MASK[k]) return; const MQ = 4;
    const mw = Math.ceil(im.width/MQ), mh = Math.ceil(im.height/MQ);
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, mw, mh);
    const d = g.getImageData(0, 0, mw, mh).data, m = new Uint8Array(mw*mh);
    for (let i = 0; i < mw*mh; i++) m[i] = d[i*4+3] > 40 ? 1 : 0;
    this.MASK[k] = { mw, mh, m, w: im.width, h: im.height, MQ }; }
  buildMasks() { for (const n in this.RIG.parts) if (!this.PROPS[n]) this.buildMask(this.partImgKey(n)); }
  maskHit(n, lx, ly) { const p = this.RIG.parts[n], M = this.MASK[this.partImgKey(n)];
    if (!M) return lx >= 0 && ly >= 0 && lx <= p.w && ly <= p.h;
    const x = Math.floor(lx*(M.w/p.w)/M.MQ), y = Math.floor(ly*(M.h/p.h)/M.MQ);
    if (x < 0 || y < 0 || x >= M.mw || y >= M.mh) return false; return M.m[y*M.mw+x] === 1; }
  pigMats() { if (this._mc && this._mc.seq === this._seq) return this._mc;
    const names = Object.keys(this.RIG.parts).filter(n => !this.PROPS[n]), inv_ = [], zs = [];
    for (const n of names) { const p = this.RIG.parts[n]; inv_.push(inv(mul(this.chainD(p.parent), this.animM(p, this.poseOf(n))))); zs.push(p.z); }
    return this._mc = { seq: this._seq, names, inv_, zs, iOuter: inv(this.outerM()) }; }
  pigAtDev(dx, dy, slop = 10*this.DPR) {
    if (!this.shown) return null;
    const M = this.pigMats(), RING = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.71,.71],[-.71,.71],[.71,-.71],[-.71,-.71]];
    for (const [ox, oy] of RING) { const [rx, ry] = apply(M.iOuter, dx+ox*slop, dy+oy*slop); let best = null, bestZ = -1e9;
      for (let i = 0; i < M.names.length; i++) { const [lx, ly] = apply(M.inv_[i], rx, ry); if (this.maskHit(M.names[i], lx, ly) && M.zs[i] > bestZ) { bestZ = M.zs[i]; best = M.names[i]; } }
      if (best) { this.lastHitPart = best; return [rx, ry]; } if (slop === 0) break; }
    return null; }

  // ---------- audio (pooled 3/sound; Chrome caps ~75 media elements) ----------
  play(k, vol = 1) { if (!this.SND[k] || !this.sfxOn()) return; let p = this.SPOOL[k];
    if (!p) { p = this.SPOOL[k] = { i: 0, a: [this.SND[k].cloneNode(), this.SND[k].cloneNode(), this.SND[k].cloneNode()] }; }
    const a = p.a[p.i++%3]; try { a.currentTime = 0; } catch (e) {} const g = this.sfxVol(); if (g <= 0) return; a.volume = Math.max(0, Math.min(1, vol*g)); a.play().catch(() => {}); }
  buzz(on) { if (on && this.sfxOn()) { if (!this.sawA && this.SND['saw_loop']) { this.sawA = this.SND['saw_loop'].cloneNode(); this.sawA.loop = true; }
      if (this.sawA) this.sawA.volume = Math.max(0, Math.min(1, .65*this.sfxVol()));
      if (this.sawA) this.sawA.play().catch(() => {}); } else if (this.sawA) { this.sawA.pause(); this.sawA.currentTime = 0; } }
  thwack(big) { this.play('body_thud', big ? 1 : .72); }

  // ---------- bubbles / effects ----------
  /** Albert: no speech bubbles for the ordinary chatter - a no-op so every call site can stay. */
  say() { this.bubble = null; }
  /** ...but he DOES announce the big one himself, in a bubble over his head. */
  announce(t, dur = 4.5) { this.bubble = { t, until: performance.now()/1000+dur }; }
  fx(key, x, y, scale = 1) { this.fxs.push({ key, x, y, t: 0, scale, rot: (Math.random()-.5)*.5 }); }
  fxPig(key, dx, dy, scale = 1, life = .38, rot) { const [rx, ry] = this.toRig(dx, dy);
    this.fxs.push({ key, rx, ry, on: 'pig', t: 0, scale, life, rot: rot === undefined ? (Math.random()-.5)*.5 : rot }); }
  /** a glow burst at a css point — the unlock "záře" (drawn on the canvas over the UI) */
  glowAt(cssX, cssY, col = '#F2B449') { this.glows.push({ x: cssX*this.DPR, y: cssY*this.DPR, t: 0, col });
    this.fx('e_ringburst', cssX*this.DPR, cssY*this.DPR, 1.3); this.play('confetti_pop', .7); this.play('pickup', .6); }
  /** THE UNLOCK: a big CENTRE-SCREEN reveal - dim the page, a turning starburst, golden rays and
   *  the item scaling in with a bounce (the DOM overlay carries its name). ~2.6 s. */
  revealItem(imgKey, gold = false) { this.reveal = { key: imgKey, t: 0, dur: 2.6, gold };
    this.play('unlock', .95); this.play('confetti_pop', .8); this.spawnConfetti(90, gold); }
  drawReveal(ctx, now) { const R = this.reveal; if (!R) return; const { W, H, DPR } = this;
    const u = R.t/R.dur, cx = W/2, cy = H*0.42;
    const fade = u < .12 ? u/.12 : (u > .82 ? Math.max(0, (1-u)/.18) : 1);
    // ONE continuous curve: grow in, then a small settle. (The old two-branch pop jumped from
    // 2.0 straight back to 1.0 at u = 0.25 - that was the "it scales then snaps smaller".)
    const pop = u < .22 ? 1-Math.cos(u/.22*Math.PI/2) : 1+Math.sin((u-.22)*7)*.06*Math.max(0, 1-(u-.22)*2.2);
    ctx.save(); ctx.globalAlpha = fade*.55; ctx.fillStyle = '#221E33'; ctx.fillRect(0, 0, W, H); ctx.restore();
    // the item first (30% smaller than it was), then everything else is sized FROM it so the glow
    // and the rays actually hug the thing you unlocked
    const im = this.IMG[R.key];
    const box = Math.min(W, H)*0.21;
    let iw = box*2, ih = box*2, s2 = 1;
    if (im && im.width) { s2 = Math.min(box*2/im.width, box*2/im.height)*pop; iw = im.width*s2; ih = im.height*s2; }
    const rad = Math.max(iw, ih)*.62+box*.30;
    ctx.save(); ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, R.gold ? 'rgba(255,229,150,.95)' : 'rgba(246,205,94,.92)');
    g.addColorStop(.55, R.gold ? 'rgba(232,179,63,.35)' : 'rgba(232,89,63,.30)');
    g.addColorStop(1, 'rgba(246,205,94,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,234,.92)';
    for (let k = 0; k < 16; k++) { const th = now*1.6+k*Math.PI/8, r1 = rad*.72, r2 = rad*(k%2 ? 1.0 : 1.22);
      ctx.lineWidth = (k%2 ? 2.5 : 5)*DPR; ctx.beginPath(); ctx.moveTo(cx+Math.cos(th)*r1, cy+Math.sin(th)*r1); ctx.lineTo(cx+Math.cos(th)*r2, cy+Math.sin(th)*r2); ctx.stroke(); }
    ctx.lineWidth = 6*DPR*(1-u); ctx.globalAlpha = fade*(1-u); ctx.beginPath(); ctx.arc(cx, cy, rad*(.8+u*.9), 0, 7); ctx.stroke();
    if (im && im.width) { ctx.globalAlpha = fade; ctx.translate(cx, cy); ctx.rotate(Math.sin(u*6)*.04);
      ctx.drawImage(im, -iw/2, -ih/2, iw, ih); }
    ctx.restore(); }

  // ---------- input ----------
  devXY(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX-r.left)*this.DPR, (e.clientY-r.top)*this.DPR]; }
  pushSample(t, x, y) { const B = this.PBUF; B.push([t, x, y]); while (B.length && t-B[0][0] > .15) B.shift(); if (B.length > 48) B.shift(); }
  releaseVel() { const t = performance.now()/1000; const s = this.PBUF.filter(q => t-q[0] <= .1);
    if (!s.length || t-s[s.length-1][0] > .025) s.push([t, this.mx, this.my]);
    if (s.length < 2) return [0, 0]; const a = s[0], b = s[s.length-1], dt = b[0]-a[0]; if (dt < .004) return [0, 0];
    return [(b[1]-a[1])/dt, (b[2]-a[2])/dt]; }
  onMove(e) { this._inWin = true; [this.mx, this.my] = this.devXY(e); const t = performance.now()/1000;
    this.hist.push([t, this.mx, this.my]); if (this.hist.length > 8) this.hist.shift(); this.pushSample(t, this.mx, this.my); }
  onDown(e) { [this.mx, this.my] = this.devXY(e); this.mdown = true; this.lastTouch = performance.now()/1000;
    if (this.dead || this.party || !this.shown) return; const w = this.tool; if (!w) return;
    const P = this.P;
    if (w.kind === 'hand') { const hit = this.pigAtDev(this.mx, this.my);
      if (hit) { this.standUpNow(); this.sprawl = 0; this.mode = 'idle'; this.grab = { lx: hit[0], ly: hit[1] }; this.anim = null; this.oneshot = null;
        this.squash(.92, 1.06); this.play('squeal_hit', .4); } }
    else if (w.kind === 'food') { if (!this.eat) { this.eat = { t: 0, x: this.mx, y: this.my, phase: 'fly' }; this.play('oink_happy', .5); this.say('Kvík! Sojový suk!', 1.2); this.standUpNow(); } }
    else if (w.kind === 'crystal') { if (!this.eat) { this.eat = { t: 0, x: this.mx, y: this.my, phase: 'fly', crystal: true }; this.play('oink_happy', .5); this.say('Kvík?! Co to je?!', 1.2); this.standUpNow(); } }
    else if (w.kind === 'swing' || w.kind === 'punch' || w.kind === 'cut') { this.strike = { t: 0, w, x: this.mx, y: this.my }; }
    else if (w.kind === 'saw') { this.held = true; this.buzz(true); }
    else if (w.kind === 'throw') { this.parts.push({ kind: 'grenade', x: this.mx, y: this.my-40*this.DPR, vx: (Math.random()-.5)*80*this.DPR, vy: -180*this.DPR, t: 0 }); }
  }
  onUp() { this.mdown = false; this.held = false; this.buzz(false); const P = this.P, GS = this.GS;
    if (this.grab) { const [cvx, cvy] = this.releaseVel(); P.vx = cvx/GS*1.2; P.vy = cvy/GS*1.2;
      if (Math.abs(P.vx) > 700 && P.y > P.ground-6) P.vy = Math.min(P.vy, -430); P.rvel += cvx*.06/GS;
      this.grab = null; this.anim = null; this.oneshot = null; this.ballistic = true; this.roam = null;
      // DROPPED inside a card (not thrown): bump him to the nearest free spot, deterministically -
      // the collision resolver alone can settle him half inside a tall tile
      if (this.overlapsWall()) { this.ghost = false; this._evict = 45;
        if (Math.abs(P.vx) < 500 && Math.abs(P.vy) < 500) {
          const cells = this.freeCells();
          if (cells.length) { const c = cells.reduce((a, b) =>
              (Math.hypot(b.x-P.x, b.y-P.y) < Math.hypot(a.x-P.x, a.y-P.y) ? b : a));
            P.x = c.x; P.y = c.y; P.vx = 0; P.vy = 0; this.squash(1.12, .9); this.thwack(false); } } }
    } }
  setTool(id) { this.tool = id ? TOOLS.find(t => t.id === id) || null : null; this.strike = null; this.held = false; this.buzz(false);
    if (this.grab) this.onUp(); this._rope = null;
    // The canvas NEVER takes pointer events (Albert: every button must stay clickable with a
    // weapon in hand). The layer listens on WINDOW instead, and only the real cursor is hidden.
    this.cv.style.pointerEvents = 'none';
    try { document.body.style.cursor = this.tool ? 'none' : ''; } catch (e) { /* ignore */ } }

  // ---------- combat / damage ----------
  squash(sx, sy) { this.P.sqx = sx; this.P.sqy = sy; }
  kick(fn) { for (const n in this.RIG.parts) if (n !== 'body') fn(n); }
  stage() { return Math.min(14, Math.floor(this.dmg/100)); }
  applyStage(prev) { const s = this.stage();
    for (let i = prev+1; i <= s; i++) { const st = STAGES[i] || {};
      if (st.head !== undefined) { if (st.head === 'blush') this.blushUntil = 1e12; else { this.headState = st.head; this.blushUntil = 0; } }
      if (st.body !== undefined) this.bodyState = st.body; if (st.bubble) this.say(st.bubble, 2.2); }
    this.emit('damage', this.dmg, s); }
  /** the cosmetic on his head right now */
  wearing() { if (this.party) return this.goldParty ? 'cos_glasses' : null; return this.cos; }
  headImgKey() { const I = this.IMG;
    if (this.dead && this.dead.phase !== 'walkin') { const k = 'head_dead_'+this.headState; return I[k] ? k : 'head_dead'; }
    if (this.eat && this.eat.phase === 'chew') { const k = 'head_eat_'+this.headState; if (I[k] && I[k].width) return k; }
    if (this.hyper) { const k = 'head_hyper_'+this.hyper.level; if (I[k] && I[k].width) return k; if (I['head_hyper'] && I['head_hyper'].width) return 'head_hyper'; }
    if (this.blushUntil && performance.now()/1000 < this.blushUntil) return 'head_blush';
    return 'head_state_'+this.headState; }
  partHurt(n, d) { const grp = n.startsWith('leg_B') ? 'legB' : (n === 'tail' ? 'tail' : (n.startsWith('teat') ? n : null)); if (!grp) return;
    this.partDmg[grp] = (this.partDmg[grp] || 0)+d; this.partState[grp] = this.partDmg[grp] >= 140 ? 2 : (this.partDmg[grp] >= 60 ? 1 : 0); }
  addDmg(d, px, py) { if (this.dead) return; const prev = this.stage(); this.dmg = Math.min(1400, this.dmg+d);
    if (this.dmg >= 1400) { this.applyStage(prev); this.die(); return; }
    this.partHurt(this.lastHitPart, d); this.applyStage(prev);
    if (this.stage() >= 1 && Math.random() < .5) this.say(this.stage() === 1 ? pick(['Hihi!', 'Hihihi!']) : pick(['Au!', 'Kvík!', 'Oink!', 'Uf!']), 1.1); }
  impact(w, px, py) { if (this.dead || this.party) return; const P = this.P;
    const bp = this.pigScreen(), dir = px > bp[0] ? -1 : 1, f = w.force;
    P.vx += dir*f*(.9+Math.random()*.4); P.vy -= f*.45; P.rvel += dir*(f*.05)*(Math.random()*.6+.7); this.ballistic = true; this.roam = null;
    this.addDmg(w.dmg, px, py); if (this.dead) return;
    const fxRot = (w.kind === 'cut' && this.strike) ? (.15+Math.sin(Math.min(1, this.strike.t/.16)*Math.PI)*1.1) : undefined;
    this.fxPig(w.fx, px, py, 1+w.dmg*.012, .38, fxRot);
    if (w.id === 'pan') this.squash(1.18, .84); else if (w.id === 'hammer') { this.squash(1.2, .62); P.vy -= 120; }
    else if (w.id === 'glove') { this.squash(.88, 1.08); P.vx += dir*260; } else if (w.id === 'bat') P.rvel += dir*140;
    else if (w.id === 'knife') P.vx -= dir*f*.4; else if (w.id === 'whip') { this.squash(.94, 1.05); P.rvel += dir*90; }
    else if (w.id === 'grenade') P.rvel += dir*(220+Math.random()*120);
    if (w.stop) this.hitstop = Math.max(this.hitstop, w.stop);
    this.startAnim(w.dmg >= 30 ? 'hit_stagger' : 'hit_flinch', true);
    this.play(w.snd || 'hit_soft', 1);
    // the pig answers a beat LATER and quieter, so the WEAPON's impact is what you hear first
    setTimeout(() => this.play(this.stage() === 1 ? 'oink_happy' : (w.dmg >= 35 ? 'squeal_big' : 'squeal_hit'), .5), 70);
    this.shake = Math.min(14, 4+w.dmg*.2); this.kick(part => { this.jigv[part] += dir*(160+Math.random()*220)*JMUL[part]; }); this.standUpNow();
    if (!this.hyper) { this.flee = 2.6+Math.random()*1.6; this.fleeFrom = px;          // terrified for a few seconds
      setTimeout(() => { if (this.flee > 0 && !this.dead) this.play('flee', .85); }, 260); }
    this.emit('hit', w.id); }
  weaponM(w, u) { const im = this.IMG[w.img], s = .6*this.IS, DPR = this.DPR; let M = T(this.mx, this.my), ang = -.35;
    if (w.kind === 'swing') ang = -.35-Math.sin(u*Math.PI)*1.25; else if (w.kind === 'cut') ang = .15+Math.sin(u*Math.PI)*1.1;
    else if (w.kind === 'punch') { if (u > 0) { const bp = this.pigScreen(), d = Math.atan2(bp[1]-this.my, bp[0]-this.mx); M = mul(M, mul(ROT(d*57.29578+90), T(0, -Math.sin(u*Math.PI)*120*DPR))); } }
    else if (w.kind === 'saw') { const bp = this.pigScreen(); ang = Math.atan2(bp[1]-this.my, bp[0]-this.mx)+(this.held ? (Math.random()-.5)*.1 : 0); }
    if (w.kind !== 'punch') M = mul(M, ROT(ang*57.29578));
    return mul(M, mul(T(-im.width*s*.2, -im.height*s*.8), SCL(s, s))); }
  weaponContact(w, u) { const M = this.weaponM(w, u); return (WCONTACT[w.id] || []).map(([x, y]) => apply(M, x, y)); }
  weaponHit(w, u) { for (const [x, y] of this.weaponContact(w, u)) { if (this.pigAtDev(x, y)) return [x, y]; } return null; }

  // ---------- life / death / party / hyper ----------
  die() { this.dead = { t: 0, phase: 'collapse' }; this.pigAlpha = 1; this.angel = null; this.party = null; this.confetti.length = 0; this.hyper = null;
    this.grab = null; this.strike = null; this.held = false; this.buzz(false); this.eat = null; this.sprawl = 0; this.hitstop = 0; this.flee = 0; this.goldParty = false;
    this.mode = 'dead'; this.startAnim('lie_down', true); this.bubble = null; this.play('squeal_big', .9); this.emit('died'); }
  deathTick(dt) { const d = this.dead; if (!d) return; d.t += dt; const P = this.P, DPR = this.DPR;
    if (d.phase === 'collapse') { if (d.t > 1.3) { d.phase = 'angel'; d.t = 0; const bp = this.pigScreen(); this.angel = { x: bp[0], y: bp[1]-120*this.GS, t: 0 }; this.play('angel_rise', .9); } }
    else if (d.phase === 'angel') { this.angel.t += dt; this.angel.y -= 150*DPR*dt; this.angel.x += Math.sin(this.angel.t*3)*40*DPR*dt; if (d.t > 2.6) { d.phase = 'decay'; d.t = 0; this.play('decay_poof', .8); } }
    else if (d.phase === 'decay') { if (this.angel) { this.angel.t += dt; this.angel.y -= 150*DPR*dt; } this.pigAlpha = Math.max(0, 1-d.t/1.4); if (d.t > 1.6) { d.phase = 'gone'; d.t = 0; this.angel = null; } }
    else if (d.phase === 'gone') { if (d.t > 1.6) { this.resetPig(); this.pigAlpha = 1; this.dead = null; this.walkIn(); } } }
  resetPig() { const P = this.P; this.dmg = 0; this.headState = 0; this.bodyState = 0; this.blushUntil = 0; this.hyper = null;
    for (const k in this.partDmg) delete this.partDmg[k]; for (const k in this.partState) delete this.partState[k]; this.fxs.length = 0;
    P.y = 0; P.vx = 0; P.vy = 0; P.rot = 0; P.rvel = 0; P.sqx = 1; P.sqy = 1; P.ground = 0; for (const n in this.jig) { this.jig[n] = 0; this.jigv[n] = 0; } this.emit('damage', 0, 0); }
  heal() { this.dmg = 0; this.headState = 0; this.bodyState = 0; this.blushUntil = 0; for (const k in this.partDmg) delete this.partDmg[k]; for (const k in this.partState) delete this.partState[k];
    for (let i = this.fxs.length-1; i >= 0; i--) if (this.fxs[i].welt) this.fxs.splice(i, 1); this.say('Kvík! Díky!', 2); this.play('oink_happy'); this.emit('damage', 0, 0); }
  kill() { if (!this.dead) { this.dmg = 1399; this.addDmg(1); } }
  rebuildStageDown() { const s = this.stage(); this.headState = 0; this.bodyState = 0; this.blushUntil = 0;
    for (let i = 1; i <= s; i++) { const st = STAGES[i] || {}; if (st.head !== undefined && st.head !== 'blush') this.headState = st.head; if (st.head === 'blush') this.blushUntil = 1e12; if (st.body !== undefined) this.bodyState = st.body; }
    if (s >= 2) this.blushUntil = 0; this.emit('damage', this.dmg, s); }
  standUpNow() { if (this.dead) return; if (this.mode === 'lie') { this.mode = 'idle'; this.startAnim('get_up', true); this.aiTimer = 1.5; } }
  startAnim(a, once) { this.anim = a; this.frame = 0; this.oneshot = once ? a : null; this._mc = null; }
  spawnConfetti(n, gold) { const { W, H, DPR } = this; const cols = gold ? GOLD_COLS : CONF_COLS; for (let i = 0; i < n; i++) this.confetti.push({ x: Math.random()*W, y: -Math.random()*H*.5, vx: (Math.random()-.5)*160*DPR, vy: (120+Math.random()*260)*DPR,
    rot: Math.random()*6.3, vr: (Math.random()-.5)*10, w: (8+Math.random()*10)*DPR, h: (5+Math.random()*6)*DPR, col: cols[i%cols.length], ph: Math.random()*6.3, t: 0, rest: 0 }); }
  /** PARTY: hat + confetti + fanfare + the dance. If he is OFF he walks in, waves, dances, leaves. */
  dance(name) { name = DANCES.includes(name) ? name : DANCES[0];
    console.info('[pig] dance', name, { shown: this.shown, visit: !!this.visit, enter: !!this.enter, dead: !!this.dead, party: !!this.party });
    if (this.dead) { this.pendingDance = name; return; }
    if (!this.shown || this.visit || this.enter) { this.pendingDance = name; if (!this.shown && !this.visit) this.visitIn(); return; }
    this.startParty(name); }
  startParty(name) { const P = this.P;
    this.goldParty = name === 'dance_ultratwerk';
    this.party = { t: 0, name, dur: this.goldParty ? 6.0 : 4.6 }; this.grab = null; this.strike = null; this.held = false; this.buzz(false); this.eat = null; this.sprawl = 0; this.hyperPause = true;
    P.vx = 0; P.vy = 0; P.rot = 0; P.rvel = 0; P.y = P.ground; this.mode = 'party'; this.startAnim(name);
    this.play('victory_fanfare', .9); this.play('confetti_pop', .8); this.spawnConfetti(this.goldParty ? 220 : 140, this.goldParty); this.emit('danceStart', name); }
  partyTick(dt) { const { FLOOR, DPR } = this;
    if (this.party) { this.party.t += dt; if (this.party.t > this.party.dur) { const nm = this.party.name; this.party = null; this.goldParty = false; this.mode = 'idle'; this.startAnim('wave', true); this.say('Kvík!', 1.2); this.aiTimer = 2.2; this.hyperPause = false;
        this.emit('danceEnd', nm); if (this.visit) { this.visit.phase = 'out'; this.visit.t = 0; } else if (this.reenterAfter) { this.reenterAfter = false; this.walkIn(); } } }
    for (let i = this.confetti.length-1; i >= 0; i--) { const c = this.confetti[i]; c.t += dt;
      if (c.y < FLOOR) { c.vy += 300*DPR*dt; c.vy = Math.min(c.vy, 320*DPR); c.x += c.vx*dt+Math.sin(c.t*4+c.ph)*60*DPR*dt; c.y += c.vy*dt; c.rot += c.vr*dt; } else { c.y = FLOOR; c.rest += dt; }
      if (c.rest > 2.5 || c.t > 12) this.confetti.splice(i, 1); } }
  /** HYPER: the crystal. Red eyes, runs at high speed bouncing off every wall for ~a minute, then dies. */
  /** every feed raises the level (1..3): faster, more frantic, a new head; the 60 s clock restarts */
  goHyper() { if (this.dead || !this.shown) return;
    if (this.hyper) { this.hyper.level = Math.min(3, this.hyper.level+1); this.hyper.t = 0; this.hyper.pt = 0; }
    else this.hyper = { t: 0, level: 1, rams: 0, pt: 0, pattern: 'dash', lastRam: 0, blocked: 0, hop: 0 };
    this.roam = null; this.flee = 0; this.ballistic = false; this.rotTarget = 0;
    this.play('crystal_high', .9);                       // ONE sound, not a pile (his note)
    this.mode = 'walk'; this.startAnim('walk'); this.standUpNow(); this.emit('hyper', this.hyper.level); }
  /** The HYPER brain. He is KINEMATIC while high (no gravity): he tears across the screen, wraps
   *  round the edges, hops, and CHASES the crystal in the cursor through the air - and when a wall
   *  is between him and it he strains toward it and RAMS. Six rams kill him. */
  hyperAI(dt, now) { const H = this.hyper, P = this.P, GS = this.GS, L = H.level;
    const SPD = [900, 1350, 1800][L-1];
    if (this.anim !== 'walk') { this.mode = 'walk'; this.startAnim('walk'); }
    const crystal = this.tool && this.tool.kind === 'crystal' && this.mx > -999;
    H.pt -= dt;
    if (H.pt <= 0 || (crystal && H.pattern !== 'chase') || (!crystal && H.pattern === 'chase')) {
      const pool = crystal ? ['chase'] : (L === 1 ? ['dash', 'dash', 'bounce', 'zigzag'] : L === 2 ? ['dash', 'bounce', 'zigzag', 'zigzag', 'ram'] : ['dash', 'zigzag', 'ram', 'ram', 'bounce', 'zigzag']);
      H.pattern = pick(pool); H.pt = (1.2+Math.random()*2.8)*(L === 3 ? .6 : 1); H.target = null; H.blocked = 0;
      if (H.pattern === 'ram') { H.target = this.pickRamTarget(); if (!H.target) H.pattern = 'dash'; }
      if (H.pattern === 'dash') P.facing = Math.random() < .5 ? 1 : -1;
    }
    if (!this._snort || now-this._snort > (crystal ? 3.0 : 4.5)/L) { this._snort = now; this.play('chase_snort', .3); }
    const bp = this.pigScreen(), x0 = P.x, y0 = P.y;
    if (H.pattern === 'chase') {
      const dx = (this.mx-bp[0])/GS, dy = (this.my-bp[1])/GS, d = Math.hypot(dx, dy) || 1;
      P.facing = dx < 0 ? 1 : -1;
      P.x += dx/d*SPD*dt; P.y += dy/d*SPD*dt;                 // straight at it, through the air
      this.rotTarget = Math.max(-42, Math.min(42, dy*.08*(P.facing < 0 ? 1 : -1)));   // straining toward it
    } else if (H.pattern === 'ram' && H.target) {
      P.facing = H.target.x < bp[0] ? 1 : -1; P.x += -P.facing*SPD*dt; this.rotTarget = 0;
    } else {
      P.x += -P.facing*SPD*dt; this.rotTarget = 0;
      if (H.pattern === 'zigzag' && Math.random() < dt*(2+L)) P.facing = -P.facing;
      if (H.pattern === 'bounce') { H.hop += dt*(5+L); P.y = -Math.abs(Math.sin(H.hop))*(220+120*L); }
      else if (P.y < 0) P.y = Math.min(0, P.y+1400*dt);
    }
    if (!this.ghost) this.resolveWalls(true);
    const moved = Math.hypot(P.x-x0, P.y-y0);
    if (moved < SPD*dt*.3) { H.blocked++;
      if (H.blocked > 6 && now-(H.lastRam || 0) > .4) { const b2 = this.pigScreen(); this.ram((crystal ? this.mx : b2[0]-P.facing) > b2[0] ? -1 : 1); H.blocked = 0; } }
    else H.blocked = 0;
    H.t += dt; if (H.t > HYPER_DUR) { this.hyper = null; this.rotTarget = 0; this.die(); } }
  pickRamTarget() { const B = this.pigBox(); const cands = this.walls.filter(r => r.h > 30*this.DPR && r.y < B.y+B.h && r.y+r.h > B.y); if (!cands.length) return null; const r = pick(cands); return { x: r.x+r.w/2, rect: r }; }
  ram(sign) { const H = this.hyper; if (!H) return; H.rams++; H.lastRam = performance.now()/1000;
    this.play('ram_thud', 1);
    this.squash(.74, 1.28); this.shake = 18; this.kick(n => { this.jigv[n] += -sign*(320+Math.random()*320)*JMUL[n]; });
    const bp = this.pigScreen(); this.fxPig('e_crush', bp[0]-sign*260*this.GS, bp[1]-40*this.GS, 1.2, .35);
    this.P.x += sign*40; this.emit('ram', H.rams); this.addDmg(12);
    if (this.hyper && H.rams >= 6) { this.hyper = null; this.rotTarget = 0; this.die(); } }
  // ---------- on/off, walk-in, visitor ----------
  setEnabled(on) { this.enabled = on;
    if (on) { if (!this.shown) { this.shown = true; this.walkIn(); } }
    else { if (!this.visit && !this.party) { this.shown = false; this.grab = null; this.strike = null; this.buzz(false); this.held = false; } } }
  /** walk in from a side along the floor to a free spot, then wave (page load / tab change) */
  walkIn() { const P = this.P; if (!this.EXT || !this.W) return; if (this.dead && this.dead.phase !== 'gone') return;
    this.shown = true; const half = (this.EXT.r-this.EXT.l)/2;
    P.y = 0; P.ground = 0; P.vx = 0; P.vy = 0; P.rot = 0; P.rvel = 0; P.sqx = 1; P.sqy = 1; this.sprawl = 0; this.grab = null; this.roam = null; this.ballistic = false;
    const tx = this.freeFloorSpot(); const side = tx < 0 ? -1 : 1;                // enter from the NEAREST side
    P.x = side*((this.W/2)/this.GS+half+60);                                    // fully off-screen
    P.facing = side < 0 ? -1 : 1;                                                 // facing 1 walks screen-left
    this.enter = { tx, t: 0 };
    this.mode = 'walk'; this.startAnim('walk'); this.hitstop = 0; }
  /** the widest floor gap between walls, in rig x (relative to W/2); prefers the entry side */
  freeFloorSpot() { const { W, FLOOR, GS } = this; const h = (this.EXT.b-this.EXT.t)*GS, band = { y: FLOOR-h, h };
    const xs = [0, W]; for (const r of this.walls) { if (r.y < band.y+band.h && r.y+r.h > band.y) { xs.push(r.x, r.x+r.w); } }
    xs.sort((a, b) => a-b); const pigW = (this.EXT.r-this.EXT.l)*GS; let best = null;
    for (let i = 0; i+1 < xs.length; i++) { const a = xs[i], b = xs[i+1]; const cover = this.walls.some(r => r.y < band.y+band.h && r.y+r.h > band.y && r.x < a+1 && r.x+r.w > b-1);
      if (cover) continue; const w = b-a; if (w < pigW*.9) continue; if (!best || w > best.w) best = { a, b, w }; }
    const cx = best ? (best.a+best.b)/2 : W/2; return (cx-W/2)/GS; }
  visitIn() { this.visit = { phase: 'in', t: 0 }; this.walkIn(); }
  /** a tab switch: vanish and walk in again (after the party if one is running) */
  reenter() { if (this.dead || !this.shown || this.visit) return; if (this.party) { this.reenterAfter = true; return; } this.walkIn(); }
  /** wrap around the screen: thrown off one side he flies in from the other (Albert: no side walls) */
  wrapScreen() { const B = this.pigBox(), W = this.W, P = this.P;
    if (B.x > W+2) P.x -= (W+B.w)/this.GS; else if (B.x+B.w < -2) P.x += (W+B.w)/this.GS; }
  /** HYPER se NEteleportuje pres obrazovku - odrazi se od kraje.
   *  Wrap byl jedina pricina toho, ze "je jich tam deset": za 50 s hyperu udelal
   *  9 skoku pres celou sirku platna (merene 2026-09-03, skok 8119 rig jednotek).
   *  Vykresleni je pritom vzdy jedno jedine - zmereno 1.00 drawRig na snimek - takze
   *  vic prasat nikdy neni SOUCASNE na platne; proto je screenshot nikdy nechyti.
   *  Oko je vidi proto, ze zmizi na jedne strane a OKAMZITE se objevi na druhe.
   *  Odraz drzi pohyb spojity, takze zadny duch nevznikne.
   *  Smer: P.x += -P.facing*SPD*dt, takze facing 1 = jde doleva, -1 = jde doprava. */
  hyperEdgeTurn() { const B = this.pigBox(), W = this.W, P = this.P, GS = this.GS;
    if (B.w >= W) return;                       // uzsi okno nez prase: nic neresime
    if (B.x < 0) { P.x += -B.x/GS; P.facing = -1; }
    else if (B.x+B.w > W) { P.x -= (B.x+B.w-W)/GS; P.facing = 1; } }
  /** under his own steam he stays WHOLE and on screen - no half pig hanging off an edge */
  keepOnScreen() { const B = this.pigBox(), W = this.W, P = this.P, GS = this.GS;
    if (B.w >= W) return;                       // a window narrower than he is: nothing to do
    if (B.x < 0) P.x += -B.x/GS; else if (B.x+B.w > W) P.x -= (B.x+B.w-W)/GS; }
  overlapsWall(pad = 2) { const B = this.pigBox(); for (const r of this.walls) { const ox = Math.min(B.x+B.w, r.x+r.w)-Math.max(B.x, r.x), oy = Math.min(B.y+B.h, r.y+r.h)-Math.max(B.y, r.y); if (ox > pad && oy > pad) return true; } return false; }
  boxFreeAt(x, y) { const P = this.P, sx = P.x, sy = P.y; P.x = x; P.y = y; const B = this.pigBox(); P.x = sx; P.y = sy;
    if (B.x < 0 || B.x+B.w > this.W || B.y < 4*this.DPR || B.y+B.h > this.FLOOR+2) return false;
    for (const r of this.walls) { const ox = Math.min(B.x+B.w, r.x+r.w)-Math.max(B.x, r.x), oy = Math.min(B.y+B.h, r.y+r.h)-Math.max(B.y, r.y); if (ox > 1 && oy > 1) return false; } return true; }
  /** every place his box fits between the walls: a deterministic grid (pig/3 steps) plus the rows on top
   *  of every card he fits on. Cached for 0.4 s. `surface` marks the floor and card tops. */
  freeCells() { const now = performance.now()/1000; if (this._fc && now-this._fcT < .4 && this._fcW === this.walls) return this._fc; this._fcT = now; this._fcW = this.walls;
    const GS = this.GS, W = this.W, half = (this.EXT.r-this.EXT.l)/2, hgt = this.EXT.b-this.EXT.t;
    const xmin = -(W/2)/GS+half+6, xmax = (W/2)/GS-half-6, ymin = (4*this.DPR+hgt*GS-this.FLOOR)/GS;
    const dx = Math.max(60, (this.EXT.r-this.EXT.l)/3), dy = Math.max(60, hgt/3); const cells = [];
    const ys = [0]; for (let y = -dy; y > ymin; y -= dy) ys.push(y); ys.push(ymin);
    const tops = this.walls.filter(r => r.w > half*GS*.6 && r.y-hgt*GS > 4*this.DPR).map(r => (r.y-this.FLOOR)/GS);
    for (const y of tops) ys.push(y);
    for (const y of ys) { const surface = y === 0 || tops.includes(y);
      for (let x = xmin; x <= xmax; x += dx) if (this.boxFreeAt(x, y)) cells.push({ x, y, surface }); }
    return this._fc = cells; }
  /** somewhere to WALK to: free cells first (floor and card tops preferred, then the air); in GHOST mode
   *  with no free cell anywhere, any point on screen */
  pickRoamTarget(anyFree = false) { const cells = this.freeCells();
    if (cells.length) { if (anyFree) return [cells[0].x, cells[0].y];
      if (this.ghost) { const P = this.P; let best = cells[0], bd = 1e18; for (const c of cells) { const d = (c.x-P.x)**2+(c.y-P.y)**2; if (d < bd) { bd = d; best = c; } } return [best.x, best.y]; }
      const surf = cells.filter(c => c.surface); const pool = (surf.length && Math.random() < .55) ? surf : cells; const c = pick(pool); return [c.x, c.y]; }
    if (anyFree || !this.ghost) return null;
    const GS = this.GS, W = this.W, half = (this.EXT.r-this.EXT.l)/2, hgt = this.EXT.b-this.EXT.t;
    const xmin = -(W/2)/GS+half+6, xmax = (W/2)/GS-half-6, ymin = (4*this.DPR+hgt*GS-this.FLOOR)/GS;
    return [xmin+Math.random()*(xmax-xmin), Math.random() < .6 ? 0 : ymin+Math.random()*(0-ymin)]; }
  /** GHOST: when the page leaves him no room at all he ignores the hitboxes and lives on top of the UI.
   *  Entered after two consecutive empty checks (1 s), left as soon as room exists and he is clear of walls. */
  updateGhost(now) { if (now-this._ghostT < .5) return; this._ghostT = now; if (!this.EXT) return;
    const free = this.freeCells().length > 0;
    if (free && this.ghost && !this.roam && this.mode !== 'wave' && this.oneshot === null) { this.aiTimer = Math.min(this.aiTimer, .2); }
    if (!free) { this._noRoom = (this._noRoom || 0)+1; if (!this.ghost && this._noRoom >= 2) { this.ghost = true; this.emit('ghost', true); } }
    else { this._noRoom = 0; if (this.ghost && !this.overlapsWall()) { this.ghost = false; this.emit('ghost', false); } } }
  roamStep(dt) { const P = this.P, R = this.roam, dx = R.tx-P.x, dy = R.ty-P.y, d = Math.hypot(dx, dy); if (this.ghost) R.fast = true; const st = (R.fast ? WALKIN_SPEED : WALK_SPEED)*dt;
    if (d <= st) { P.x = R.tx; P.y = R.ty; this.roam = null; this.rotTarget = 0; this.mode = 'idle'; this.startAnim('idle'); this.aiTimer = 1.5+Math.random()*2.5; return; }
    const x0 = P.x, y0 = P.y; P.x += dx/d*st; P.y += dy/d*st; if (Math.abs(dx) > 8) P.facing = dx < 0 ? 1 : -1;
    this.rotTarget = Math.max(-14, Math.min(14, (dy/Math.max(120, Math.abs(dx)))*14*(P.facing < 0 ? 1 : -1)));
    if (!this.ghost) this.resolveWalls(true);
    R.stuck = Math.hypot(P.x-x0, P.y-y0) < st*.25 ? R.stuck+1 : 0;
    if (R.stuck > 12) { this.roam = null; this.rotTarget = 0; this.mode = 'idle'; this.startAnim('idle'); this.aiTimer = 1+Math.random()*2; } }

  // ---------- walls ----------
  setWalls(cssRects) { const D = this.DPR; this.walls = cssRects.map(r => ({ x: r.x*D, y: r.y*D, w: r.w*D, h: r.h*D })); this._fc = null; }
  /** push him out of every wall he overlaps; returns which sides hit */
  resolveWalls(heldMode) { const P = this.P, GS = this.GS; let n = 0;
    for (let it = 0; it < 3; it++) { const B = this.pigBox(); let moved = false;
      for (const r of this.walls) {
        const ox = Math.min(B.x+B.w, r.x+r.w)-Math.max(B.x, r.x), oy = Math.min(B.y+B.h, r.y+r.h)-Math.max(B.y, r.y);
        if (ox <= 0 || oy <= 0) continue; n++;
        const bcx = B.x+B.w/2, bcy = B.y+B.h/2, rcx = r.x+r.w/2, rcy = r.y+r.h/2;
        if (ox < oy) { const sign = bcx < rcx ? -1 : 1; P.x += sign*ox/GS; this.wallHit(-sign, heldMode); }
        else { let sign = bcy < rcy ? -1 : 1;
          // he may only STAND on a wall's top if he fits between it and the screen's roof; otherwise
          // (the topbar) the wall is a roof and he is pushed out below it
          if (sign < 0 && B.y-oy < 4*this.DPR) sign = 1;
          P.y += sign*oy/GS;
          if (sign < 0) { this.land(heldMode, (r.y-this.FLOOR)/GS); } else { if (P.vy < 0) { P.vy = heldMode ? 0 : Math.abs(P.vy)*.45; if (!heldMode) { this.thwack(false); this.kick(nm => { this.jigv[nm] += (Math.random()-.5)*260; }); } } } }
        moved = true; }
      if (!moved) break; }
    if (!this.grab && this.overlapsWall()) { if (++this.stuckFrames > 20) { this.stuckFrames = 0; if (!this.ghost) { this.ghost = true; this.emit('ghost', true); } } } else this.stuckFrames = 0;
    return n; }
  wallHit(sign, heldMode) { const P = this.P; const sp = Math.abs(P.vx);
    // HYPER first: he is kinematic while high, so a ram must not be swallowed by the held-mode exit
    if (this.hyper && !this.grab) { P.facing = sign < 0 ? -1 : 1;
      const H = this.hyper, bp = this.pigScreen(), now = performance.now()/1000;
      const chasing = this.tool && this.tool.kind === 'crystal' && ((sign > 0 && this.mx > bp[0]) || (sign < 0 && this.mx < bp[0]));
      if ((chasing || H.pattern === 'ram' || H.level >= 2) && now-(H.lastRam || 0) > .4) this.ram(sign);
      else { P.vx = -sign*Math.max(sp*.9, 1400); }
      return; }
    if (heldMode) { if (P.vx*sign > 0) P.vx = 0; return; }
    P.vx = -sign*sp*.6; P.rvel += -sign*Math.min(160, sp*.03);
    if (sp > 500 && !this.grab) { this.squash(.84, 1.12); this.thwack(sp > 1500); this.shake = Math.min(14, sp*.006);
      this.kick(nm => { this.jigv[nm] += -sign*(150+Math.random()*250)*JMUL[nm]; }); if (sp > 1100) this.play('squeal_hit', .7); }
    if (this.mode === 'walk') P.facing = sign < 0 ? -1 : 1; }
  /** the landing branch (game v10 numbers): silent under vy 800, thud to 1400, sprawl + damage above */
  land(heldMode, groundY) { const P = this.P; if (heldMode) { if (P.vy > 0) P.vy = 0; P.ground = groundY; return; }
    if (P.vy > 800) { this.thwack(P.vy > 1400); this.shake = Math.min(16, P.vy*.008); this.squash(1.22, .78); this.kick(n => { this.jigv[n] += (Math.random()-.5)*500; }); P.rvel += P.vx*.06;
      if (P.vy > 1400) { this.sprawl = .9+Math.random()*.3; this.anim = null; this.oneshot = null; const bp = this.pigScreen(); this.fxPig('e_dust', bp[0], bp[1], 1.6, .5); this.play('squeal_big', .8);
        this.addDmg(Math.max(1, Math.round((P.vy-1400)*.02)), bp[0], bp[1]-200*this.GS); }
      else if (Math.abs(P.rvel) > 140) { this.sprawl = .9+Math.random()*.3; this.anim = null; this.oneshot = null; }
      else this.startAnim('hit_flinch', true); }
    P.vy = 0; P.vx *= .72; P.rvel *= .5; P.ground = groundY; this.ballistic = false; }
  /** is there support under his feet? sets P.ground to the surface he stands on (0 = the floor) */
  updateSupport() { const P = this.P, GS = this.GS, B = this.pigBox(); const feet = B.y+B.h; let g = 0;
    for (const r of this.walls) { if (r.x < B.x+B.w*.75 && r.x+r.w > B.x+B.w*.25) { if (Math.abs(feet-r.y) < 3*this.DPR || (P.ground < 0 && Math.abs(r.y-this.FLOOR-P.ground*GS) < 2)) { g = Math.min(g, (r.y-this.FLOOR)/GS); } } }
    // if he stood on a surface that is no longer under him, he falls to the floor
    if (P.ground < 0 && g === 0) { P.ground = 0; } else if (g < 0) P.ground = g; }

  // ---------- layout ----------
  resize() { const cv = this.cv; this.DPR = devicePixelRatio || 1; this.W = innerWidth*this.DPR; this.H = innerHeight*this.DPR;
    cv.width = this.W; cv.height = this.H; cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
    this.GS = this.scale*this.DPR; this.FLOOR = this.H-2*this.DPR; this.IS = this.DPR*(this.scale/0.315); }

  /** the CLOSET preview: him at rest wearing `cosId`, fitted into any canvas */
  setCos(id) { this.cos = id || null; }
  renderPreview(ctx2, W2, H2, cosId) {
    if (!this.RIG || !this.EXT) return;
    const sv = { anim: this.anim, frame: this.frame, cos: this.cos, party: this.party, dead: this.dead, eat: this.eat, hyper: this.hyper, jig: { ...this.jig }, facing: this.P.facing };
    this.anim = 'idle'; this.frame = 0; this.cos = cosId || null; this.party = null; this.dead = null; this.eat = null; this.hyper = null;
    for (const n in this.jig) this.jig[n] = 0;
    const B = this.BPOS, E = this.EXT;
    // the cosmetic sits above his head, so allow headroom above the body extent
    const top = E.t-320, w = E.r-E.l, h = E.b-top;
    const s = Math.min(W2/(w*1.06), H2/(h*1.06));
    let M = mul(T(W2/2-((E.l+E.r)/2)*s, H2/2-((top+E.b)/2)*s), mul(SCL(s, s), T(-B[0], -B[1])));
    ctx2.clearRect(0, 0, W2, H2); this.drawRig(ctx2, M); ctx2.setTransform(1, 0, 0, 1, 0, 0);
    Object.assign(this, { anim: sv.anim, frame: sv.frame, cos: sv.cos, party: sv.party, dead: sv.dead, eat: sv.eat, hyper: sv.hyper });
    for (const n in sv.jig) this.jig[n] = sv.jig[n]; this.P.facing = sv.facing;
  }

  // ---------- main loop ----------
  tick() { if (this.destroyed) return; requestAnimationFrame(this.tick);
    if (this.W === 0 || this.H === 0 || !this.RIG) { this.resize(); if (this.W === 0 || this.H === 0 || !this.RIG) return; }
    this._seq++; const now = performance.now()/1000, rdt = Math.min(.05, now-this.last); this.last = now;
    let dt = rdt; if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop-rdt); this._froz = (this._froz || 0)+rdt; if (this._froz < .14) dt = 0; else this.hitstop = 0; } else this._froz = 0;
    const P = this.P, GS = this.GS, DPR = this.DPR, W = this.W, H = this.H, FLOOR = this.FLOOR, mx = this.mx, my = this.my;
    if (!this._cv) this._cv = { vx: 0, vy: 0, ax: 0, ay: 0, px: mx, py: my };
    { const c = this._cv, nvx = (mx-c.px)/Math.max(rdt, .001), nvy = (my-c.py)/Math.max(rdt, .001);
      c.ax = c.ax*.6+.4*(nvx-c.vx)/Math.max(rdt, .001); c.ay = c.ay*.6+.4*(nvy-c.vy)/Math.max(rdt, .001); c.vx = nvx; c.vy = nvy; c.px = mx; c.py = my; }
    this.deathTick(dt); this.partyTick(dt);
    if (this._evict > 0) { this._evict--; if (this.overlapsWall()) { this.ghost = false; if (this._evict < 3) this._evict = 3; } }
    if (this.reveal) { this.reveal.t += rdt; if (this.reveal.t > this.reveal.dur) this.reveal = null; }
    if (this.pendingDance && !this.dead && this.shown && !this.enter && !this.party && !this.visit) { const d = this.pendingDance; this.pendingDance = null; this.startParty(d); }
    if (this.shown) this.simulate(dt, rdt, now);
    try { this.draw(now, rdt); }
    catch (e) { if (!this._drawErr) { this._drawErr = 1; console.error('[pig] draw failed: ' + ((e && e.stack) || e)); } }
  }
  simulate(dt, rdt, now) {
    const P = this.P, GS = this.GS, DPR = this.DPR, W = this.W, H = this.H, FLOOR = this.FLOOR, mx = this.mx, my = this.my;
    // --- ENTER (walk-in): walk along the floor to the target spot, then wave ---
    if (this.enter && !this.dead) { this.enter.t += dt; const dir = Math.sign(this.enter.tx-P.x) || 1; P.facing = dir < 0 ? 1 : -1;
      const sp = this.hyper ? 900 : WALKIN_SPEED; const x0 = P.x; P.x += dir*sp*dt;
      const B = this.pigBox(); if (!this.ghost && B.x > 0 && B.x+B.w < W) this.resolveWalls(true);        // once fully on screen the UI blocks him
      this.enter.stuck = (Math.abs(P.x-x0) < sp*dt*.2) ? (this.enter.stuck || 0)+1 : 0;
      if (Math.abs(P.x-this.enter.tx) < sp*dt*1.5 || this.enter.t > 12 || this.enter.stuck > 8) { P.x = Math.abs(P.x-this.enter.tx) < 40 ? this.enter.tx : P.x; this.enter = null; this.mode = 'wave'; this.startAnim('wave', true); this.say('Ahoj!', 1.6); this.play('oink_happy', .7); this.aiTimer = 2.4;
        if (this.visit && this.visit.phase === 'in') { this.visit.phase = 'dance'; if (this.pendingDance) { const d = this.pendingDance; this.pendingDance = null; setTimeout(() => { if (this.visit) this.startParty(d); }, 900); } } } }
    // --- VISITOR leaving: walk out to the nearest side, then hide ---
    else if (this.visit && this.visit.phase === 'out' && !this.party && !this.dead) { this.visit.t += dt; if (this.visit.t > 1.4) { const dir = P.x < 0 ? -1 : 1; P.facing = dir < 0 ? 1 : -1; if (this.anim !== 'walk') { this.mode = 'walk'; this.startAnim('walk'); } P.x += dir*WALKIN_SPEED*dt;
        const half = (this.EXT.r-this.EXT.l)/2; if (Math.abs(P.x) > (W/2)/GS+half+40) { this.visit = null; if (!this.enabled) this.shown = false; else this.walkIn(); } } }
    // --- HYPER brain (runs on the ground and steers in the air) ---
    else if (this.hyper && !this.grab && !this.dead && !this.party) { this.hyperAI(dt, now); }
    // --- TERRIFIED: just hit by a weapon, he bolts away from where the blow came from ---
    else if (this.flee > 0 && !this.grab && !this.dead && !this.party && !this.ballistic && this.sprawl <= 0) {
      this.flee -= dt;
      if (this.anim !== 'walk') { this.mode = 'walk'; this.startAnim('walk'); }
      if (this.roam) { this.roamStep(dt); }                       // re-routed round whatever blocked him
      else {
        const bp = this.pigScreen(), away = this.fleeFrom > bp[0] ? -1 : 1;
        P.facing = away < 0 ? 1 : -1; const x0 = P.x; P.x += away*WALK_SPEED*2.4*dt;
        this.rotTarget = 0;
        if (!this.ghost) this.resolveWalls(true);
        // pinned against a card: bolt to the free spot FURTHEST from the blow instead of shoving
        if (Math.abs(P.x-x0) < WALK_SPEED*2.4*dt*.3) { this._fstuck = (this._fstuck || 0)+1;
          if (this._fstuck > 6) { this._fstuck = 0;
            const cells = this.freeCells();
            if (cells.length) { const fx = (this.fleeFrom-this.W/2)/this.GS;
              const c = cells.reduce((a, b) => (Math.abs(b.x-fx) > Math.abs(a.x-fx) ? b : a));
              this.roam = { tx: c.x, ty: c.y, stuck: 0 }; } } }
        else this._fstuck = 0;
      }
      if (this.flee <= 0) { this.roam = null; this._fstuck = 0; this.mode = 'idle'; this.startAnim('idle'); this.aiTimer = .8; }
    }
    // --- AI: he ROAMS the background - the floor, the tops of cards, the air - whenever nothing is throwing him ---
    else if (!this.grab && !this.dead && !this.party && this.oneshot === null && !this.ballistic && this.sprawl <= 0) {
      if (this.anim === null) { this.startAnim('hit_flinch', true); this.mode = 'idle'; this.aiTimer = 1; }
      this.aiTimer -= dt;
      if (!this._squeak || now-this._squeak > 6+Math.random()*9) { this._squeak = now+Math.random()*4; if (!this.grab && this.oneshot === null) this.play(this.stage() >= 11 ? 'oink_sad' : pick(['grunt_idle', 'oink_happy']), .55); }
      const lure = this.tool && this.tool.kind === 'food' && this.mx > -999 && !this.eat;
      if (lure) {
        const bp = this.pigScreen(), dx = (this.mx-bp[0])/GS, dy = (this.my-bp[1])/GS, d = Math.hypot(dx, dy) || 1;
        this.roam = null;
        if (d > 90) { if (this.anim !== 'walk') { this.mode = 'walk'; this.startAnim('walk'); }
          P.facing = dx < 0 ? 1 : -1; const sp = WALK_SPEED*2.2; P.x += dx/d*sp*dt; P.y += dy/d*sp*dt;   // eager, but nothing like the crystal
          this.rotTarget = Math.max(-12, Math.min(12, dy*.02*(P.facing < 0 ? 1 : -1)));
          if (!this.ghost) this.resolveWalls(true); }
        else { this.rotTarget = 0; if (this.anim !== 'idle' && this.anim !== 'wave') { this.mode = 'idle'; this.startAnim('idle'); } }
        this.aiTimer = 1.2;
      }
      else if (this.aiTimer <= 0 && !this.eat) {
        if (this.mode === 'lie') { if (Math.random() < .25) this.standUpNow(); else this.aiTimer = 2+Math.random()*3; }
        else if (this.mode === 'eat') { this.mode = 'idle'; this.aiTimer = 1.5; }
        else { const r = Math.random();
          if (r < .22) { this.mode = 'wave'; this.startAnim('wave', true); this.aiTimer = 2.2; this.say('Ahoj!', 1.6); this.play('oink_happy', .6); }
          else if (r < .72) { const tgt = this.pickRoamTarget(); if (tgt) { const dist = Math.hypot(tgt[0]-P.x, tgt[1]-P.y); const fast = this.ghost || dist > 1500; this.roam = { tx: tgt[0], ty: tgt[1], stuck: 0, fast }; this.mode = 'walk'; this.startAnim('walk'); this.aiTimer = dist/(fast ? WALKIN_SPEED : WALK_SPEED)+1.5; } else { this.mode = 'idle'; this.startAnim('idle'); this.aiTimer = 2; } }
          else { this.mode = 'idle'; this.startAnim('idle'); this.aiTimer = 2+Math.random()*3; } } }
      if (!lure) { if (this.mode === 'walk' && this.roam) this.roamStep(dt); else if (this.mode === 'walk' && !this.roam) { this.mode = 'idle'; this.startAnim('idle'); } }
    }
    this.updateGhost(now);
    // --- anim clock ---
    if (this.anim && this.RIG.anims[this.anim]) { const A = this.RIG.anims[this.anim];
      let rate = 1; if (this.anim === 'walk') { rate = this.hyper ? 3 : ((this.enter || (this.visit && this.visit.phase === 'out') || (this.roam && this.roam.fast)) ? WALKIN_SPEED/WALK_SPEED : 1); }
      this.frame += A.fps*dt*rate;
      if (this.frame >= A.len) { if (this.oneshot === 'lie_down') { this.oneshot = null; this.startAnim('lie_idle'); }
        else if (this.oneshot) { this.oneshot = null; if (this.mode !== 'lie' && this.mode !== 'dead') this.mode = 'idle'; this.startAnim((this.mode === 'lie' || this.mode === 'dead') ? 'lie_idle' : 'idle'); this.aiTimer = Math.min(this.aiTimer, 1+Math.random()*2); }
        else this.frame %= A.len; } }
    // --- physics ---
    if (this.grab) {
      const gw = apply(this.outerM(), this.grab.lx, this.grab.ly); const aTrk = 1-Math.exp(-11*dt);
      const wx = (mx-gw[0])/GS, wy = (my-gw[1])/GS+26; P.x += wx*aTrk; P.y += wy*aTrk;
      P.vx = P.vx*.7+.3*(wx*aTrk/Math.max(dt, .001)); P.vy = P.vy*.7+.3*(wy*aTrk/Math.max(dt, .001));
      const gdx = (this.grab.lx-this.BPOS[0])*(P.facing < 0 ? -1 : 1), gdy = this.grab.ly-this.BPOS[1], gr = Math.hypot(gdx, gdy);
      let cvx = 0; if (this.hist.length > 1) { const a = this.hist[0], b = this.hist[this.hist.length-1], hd = Math.max(.02, b[0]-a[0]); cvx = (b[1]-a[1])/hd; }
      let target = 0; if (gr > 60) target = (-90-Math.atan2(gdy, gdx)*57.29578); target += Math.max(-24, Math.min(24, cvx*.02));
      while (target-P.rot > 180) target -= 360; while (target-P.rot < -180) target += 360;
      const omr = 6.0; P.rvel += ((target-P.rot)*omr*omr-2*.95*omr*P.rvel)*dt; P.rvel = Math.max(-260, Math.min(260, P.rvel)); P.rot += P.rvel*dt;
      // while you are HOLDING him nothing blocks him - walls included (his ask); the moment you
      // let go the normal collision pushes him back out of whatever he was dragged into
      this.clampScreen(true); if (P.y > 0) { P.y = 0; if (P.vy > 0) P.vy = 0; }
    } else if (this.ballistic || this.sprawl > 0 || this.enter || (this.visit && this.visit.phase === 'out') || P.y > 0) {
      // substep so a fast throw cannot tunnel through a thin wall (a line of text is ~20 px)
      const spd = Math.max(Math.abs(P.vx), Math.abs(P.vy))*GS*dt, n = Math.min(6, Math.max(1, Math.ceil(spd/(8*DPR))));
      for (let i = 0; i < n; i++) { const h = dt/n; P.vy += 2600*h; P.x += P.vx*h; P.y += P.vy*h; P.rot += P.rvel*h;
        if (!this.enter && !(this.visit && this.visit.phase === 'out')) { this.clampScreen(false); if (!this.ghost || this._evict > 0) this.resolveWalls(false); }
        if (P.y > 0) { P.y = 0; this.land(false, 0); } }
      this.updateSupport();
      const grounded = P.y >= P.ground-1 && Math.abs(P.vy) < 40;
      if (grounded && this.sprawl <= 0) { const om2 = 2*Math.PI*1.6; P.rvel += (-om2*om2*P.rot-2*.9*om2*P.rvel)*dt; }
      P.vx *= Math.pow(P.y < P.ground-2 ? .85 : (this.hyper ? .98 : .5), dt);
    } else {
      // under his own control: no gravity (he walks the air), walls still block, he rights himself
      this.clampScreen(true); if (!this.ghost) this.resolveWalls(true);
      const om2 = 2*Math.PI*1.6; P.rvel += (-om2*om2*(P.rot-this.rotTarget)-2*.9*om2*P.rvel)*dt; P.rot += P.rvel*dt; P.vx = 0; P.vy = 0;
    }
    // Hozene prase a prichod/odchod ze sceny se pres kraj prenesou (to je zamer).
    // HYPER uz ne - ten se odrazi, viz hyperEdgeTurn().
    if (this.ballistic || this.enter || (this.visit && this.visit.phase === 'out')) this.wrapScreen();
    else if (this.hyper) this.hyperEdgeTurn();
    // walking / idling / lured / fleeing: he is kept whole and on screen. Only the walk-in-out,
    // a throw (ballistic) and a hyper dash are allowed to cross an edge, and those wrap instantly.
    if (!this.enter && !(this.visit && this.visit.phase === 'out') && !this.hyper && !this.ballistic && !this.grab) this.keepOnScreen();
    // --- ragdoll limb springs ---
    const airborne = this.grab || P.y < P.ground-2 || Math.abs(P.vy) > 60;
    const GK = { head: .5, tail: .8, leg_FN: .95, leg_FF: .95, leg_BN: .95, leg_BF: .95, teat_A: 1, teat_B: 1, teat_C: 1 };
    const cvk = this._cv || { ax: 0, ay: 0 }; const shakeDrive = this.grab ? Math.max(-3000, Math.min(3000, cvk.ax*.55+cvk.ay*.25)) : 0;
    for (const n in this.RIG.parts) { if (n === 'body' || this.PROPS[n]) continue; const always = n.startsWith('teat'); const act = airborne ? 1 : (always ? .8 : 0);
      const TL = -40, TH = 60;
      const hang = airborne ? (n === 'tail' ? Math.max(TL, Math.min(TH, -P.rot*GK[n])) : Math.max(-80, Math.min(80, -P.rot*GK[n]))) : 0;
      const alt = (n === 'leg_FF' || n === 'leg_BN' || n === 'teat_B') ? -1 : 1;
      const drive = ((-P.vx*.010-P.rvel*.14)*act+shakeDrive*.06*alt)*JMUL[n];
      const k = this.grab ? (always ? 14 : 20) : (airborne ? 26 : (JK[n] || 46)); const damp = this.grab ? 3.2 : (airborne ? 3.8 : (always ? 4.5 : 7));
      this.jigv[n] += ((hang-this.jig[n])*k-this.jigv[n]*damp+drive*60)*dt; this.jig[n] += this.jigv[n]*dt;
      const cap = ((this.grab || airborne) ? JMAX[n]*2.2 : JMAX[n]*(always ? .8 : .3))+Math.abs(hang);
      if (this.jig[n] > cap) { this.jig[n] = cap; this.jigv[n] *= -.4; } if (this.jig[n] < -cap) { this.jig[n] = -cap; this.jigv[n] *= -.4; }
      if (n === 'tail') { if (this.jig[n] > TH) { this.jig[n] = TH; this.jigv[n] *= -.4; } if (this.jig[n] < TL) { this.jig[n] = TL; this.jigv[n] *= -.4; } } }
    if (!this._sqv) this._sqv = { x: 0, y: 0 };
    { const s = this._sqv, om4 = 2*Math.PI*3.2; s.x += ((1-P.sqx)*om4*om4-2*.55*om4*s.x)*dt; P.sqx += s.x*dt; s.y += ((1-P.sqy)*om4*om4-2*.55*om4*s.y)*dt; P.sqy += s.y*dt; }
    this.sawJit *= Math.pow(.001, dt);
    if (this.sprawl > 0 && !this.grab) { this.sprawl -= dt; const om3 = 2*Math.PI*2.2, tgt = this.sprawl > 0.25 ? (P.rot >= 0 ? 86 : -86) : 0;
      P.rvel += ((tgt-P.rot)*om3*om3*dt-2*.9*om3*P.rvel*dt); if (this.sprawl <= 0 && !this.grab) this.startAnim('hit_dizzy', true); }
    // --- saw hold ---
    if (this.held && this.tool && this.tool.kind === 'saw') { const c = this.weaponHit(this.tool, 0);
      if (c) { this.sawJit = (Math.random()-.5)*9*DPR; if (!this._saw || now-this._saw > .09) { this._saw = now; this.addDmg(6, c[0], c[1]);
        this.fxPig('e_sputter', c[0]+(Math.random()-.5)*40, c[1]+(Math.random()-.5)*40, .8, .25); this.kick(n => { this.jigv[n] += (Math.random()-.5)*220*JMUL[n]; });
        P.rvel += (Math.random()-.5)*16; this.shake = 4; this.standUpNow(); if (Math.random() < .12) this.play('squeal_hit', .6); } } }
    // --- eating: the suk (or the crystal) flies to his MOUTH, three bites ---
    if (this.eat) { const e = this.eat; e.t += dt;
      if (e.phase === 'fly') { const mo = this.mouthScreen(), u = Math.min(1, e.t/.5); e.dx = e.x+(mo[0]-e.x)*u; e.dy = e.y+(mo[1]-e.y)*u-140*DPR*4*u*(1-u); if (u >= 1) { e.phase = 'chew'; e.t = 0; e.bites = 0; this.startAnim('eat', true); } }
      else if (e.phase === 'chew') { const mo = this.mouthScreen(); e.dx = mo[0]; e.dy = mo[1]; const due = Math.floor(e.t/.55);
        if (due > e.bites) { e.bites = due; this.play(e.crystal ? 'crystal_munch' : 'munch', .9); this.squash(1.03, .97);
          if (e.bites >= 3) { const cr = e.crystal; this.eat = null; if (cr) { this.goHyper(); } else { this.dmg = Math.max(0, this.dmg-60); this.rebuildStageDown(); this.say(pick(['Mňam! Sojový suk!', 'Kvík! Mňam!']), 1.6); this.play('oink_happy', .8); } } } } }
    // --- strikes ---
    if (this.strike) { const s = this.strike; s.t += dt; const w = s.w;
      if (!s.hit && s.t >= .05) { const c = this.weaponHit(w, Math.min(1, s.t/.16)); if (c) { s.hit = true; this.impact(w, c[0], c[1]); } else if (s.t >= .2) s.hit = true; }
      if (s.t > .28) this.strike = null; }
    // --- the WHIP: verlet rope pinned to the cursor ---
    if (this.tool && this.tool.kind === 'whip' && mx > -999) {
      if (!this._rope) { const N = 14, seg = 32*this.IS, pts = []; for (let i = 0; i < N; i++) pts.push({ x: mx+i*seg, y: my, px: mx+i*seg, py: my, inv: i === 0 ? 0 : Math.pow(1.6, i/(N-1)*3) });
        this._rope = { pts, seg, N, cool: 0, acc: 0, lastMx: mx, lastMy: my, peak: 0 }; }
      const R = this._rope; R.cool -= dt;
      if (Math.hypot(mx-R.lastMx, my-R.lastMy) > 240*DPR) for (const p of R.pts) { p.x = mx; p.y = my; p.px = mx; p.py = my; }
      const cdx = mx-R.lastMx, cdy = my-R.lastMy; R.lastMx = mx; R.lastMy = my; R.acc += dt; const SDT = 1/120; let steps = Math.min(6, Math.floor(R.acc/SDT)); R.acc -= steps*SDT;
      for (let s = 0; s < steps; s++) { const DAMP = .99, GRAV = .16*DPR;
        for (let i = 1; i < R.N; i++) { const p = R.pts[i]; let vx = (p.x-p.px)*DAMP, vy = (p.y-p.py)*DAMP; const vm = Math.hypot(vx, vy), vcap = R.seg*2.5; if (vm > vcap) { vx *= vcap/vm; vy *= vcap/vm; } p.px = p.x; p.py = p.y; p.x += vx; p.y += vy+GRAV; }
        R.pts[0].x = mx; R.pts[0].y = my; R.pts[0].px = mx-cdx/Math.max(1, steps); R.pts[0].py = my-cdy/Math.max(1, steps);
        for (let it = 0; it < 3; it++) { R.pts[0].x = mx; R.pts[0].y = my;
          for (let i = 0; i < R.N-1; i++) { const a = R.pts[i], b = R.pts[i+1]; const dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy) || 1e-4; const diff = (d-R.seg)/d, wa = a.inv/(a.inv+b.inv || 1); a.x += dx*diff*wa; a.y += dy*diff*wa; b.x -= dx*diff*(1-wa); b.y -= dy*diff*(1-wa); }
          for (let i = 0; i < R.N-2; i++) { const a = R.pts[i], b = R.pts[i+2]; const dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy) || 1e-4; const diff = (d-R.seg*2)/d*.15, wa = a.inv/(a.inv+b.inv || 1); a.x += dx*diff*wa; a.y += dy*diff*wa; b.x -= dx*diff*(1-wa); b.y -= dy*diff*(1-wa); } } }
      const tip = R.pts[R.N-1]; const tipV = Math.hypot(tip.x-tip.px, tip.y-tip.py); R.peak = Math.max(R.peak*.94, tipV);
      // A MISS IS SILENT (his order) and must not arm the cooldown - that is what made the whip
      // "sometimes not work at all": a fast swing that missed blocked the next 0.28 s of hits.
      // The lash is tested along the last SIX segments with a generous ring, so a real hit lands.
      if (R.cool <= 0 && R.peak > R.seg*.62) {
        for (const j of [R.N-1, R.N-2, R.N-3, R.N-4, R.N-5, R.N-6]) { const p = R.pts[j]; if (!p) continue;
          if (this.pigAtDev(p.x, p.y, 18*DPR)) { R.cool = .28; const w = this.tool;
            this.play('whip_crack', .55);                          // crack + lash, only on a hit
            this.impact({ ...w, force: Math.min(1400, 300+R.peak*9/DPR) }, p.x, p.y); break; } } }
    } else this._rope = null;
    // --- particles (real time) ---
    for (let i = this.parts.length-1; i >= 0; i--) { const q = this.parts[i]; q.t += rdt;
      if (q.kind === 'ring') { if (q.t > .5) this.parts.splice(i, 1); }
      else if (q.kind === 'grenade') { q.vy += 2200*DPR*rdt; q.x += q.vx*rdt; q.y += q.vy*rdt; if (q.y > FLOOR) { q.y = FLOOR; q.vy *= -.45; q.vx *= .7; }
        for (const r of this.walls) { if (q.x > r.x && q.x < r.x+r.w && q.y > r.y && q.y < r.y+r.h) { if (q.vy > 0 && q.y-r.y < 24*DPR) { q.y = r.y; q.vy *= -.45; q.vx *= .7; } else { q.vx *= -.6; q.x += q.vx*rdt*3; } } }
        if (q.t > 1.1) { this.play('explosion'); this.shake = 18; this.fx('e_boom', q.x, q.y-30*DPR, 2.2); this.parts.push({ kind: 'ring', x: q.x, y: q.y, t: 0 });
          const bp = this.pigScreen(); const d = Math.hypot(q.x-bp[0], q.y-bp[1]);
          if (d < 520*GS+300*DPR && !this.dead && !this.party) { const dir = bp[0] > q.x ? 1 : -1; P.vx += dir*1400; P.vy -= 1100; P.rvel += dir*(220+Math.random()*120); this.ballistic = true; this.roam = null;
            this.addDmg(90, q.x, q.y); this.startAnim('hit_stagger', true); this.kick(n => this.jigv[n] += (Math.random()-.5)*700); this.standUpNow(); this.emit('hit', 'grenade'); }
          this.parts.splice(i, 1); } } }
    for (let i = this.fxs.length-1; i >= 0; i--) { this.fxs[i].t += rdt; if (this.fxs[i].t > (this.fxs[i].life || .38)) this.fxs.splice(i, 1); }
    for (let i = this.glows.length-1; i >= 0; i--) { this.glows[i].t += rdt; if (this.glows[i].t > 1.6) this.glows.splice(i, 1); }
  }
  /** the screen edges are walls too (unless he is walking in or out) */
  clampScreen(heldMode) { const P = this.P, GS = this.GS; const B = this.pigBox();
    const CEIL = 4*this.DPR; if (B.y < CEIL) { P.y += (CEIL-B.y)/GS; if (P.vy < 0) { P.vy = heldMode ? 0 : Math.abs(P.vy)*.45; if (!heldMode) { this.thwack(false); this.kick(n => { this.jigv[n] += (Math.random()-.5)*260; }); } } } }

  // ---------- draw ----------
  drawRig(ctx = this.ctx, outer = null) { const I = this.IMG; outer = outer || this.outerM();
    const names = Object.keys(this.RIG.parts).sort((a, b) => this.RIG.parts[a].z-this.RIG.parts[b].z);
    for (const n of names) { if (this.PROPS[n] && !this.PROPS[n]()) continue; const p = this.RIG.parts[n];
      const M = mul(outer, mul(this.chainD(p.parent), this.animM(p, this.poseOf(n)))); ctx.setTransform(M[0], M[3], M[1], M[4], M[2], M[5]);
      let img; if (n === 'head') img = I[this.headImgKey()]; else if (n === 'body') img = I['body_state_'+this.bodyState];
      else if (n.startsWith('leg_B') && this.partState['legB']) img = I['leg_state_'+this.partState['legB']] || I[p.key];
      else if (n === 'tail' && this.partState['tail']) img = I['tail_state_'+this.partState['tail']] || I[p.key];
      else if (n.startsWith('teat') && this.partState[n]) img = I['teat_state_'+this.partState[n]] || I[p.key]; else img = I[p.key];
      if (img && img.width) ctx.drawImage(img, 0, 0, p.w, p.h); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); }
  draw(now, rdt) { const ctx = this.ctx, { W, H, DPR, GS, FLOOR, I = this.IMG } = this, mx = this.mx, my = this.my, P = this.P;
    // reset() drops every save, transform, clip and alpha AND clears - so a frame can never
    // inherit a broken state from an exception in the frame before it
    if (ctx.reset) ctx.reset(); else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const sx = (Math.random()-.5)*this.shake*DPR, sy = (Math.random()-.5)*this.shake*DPR; this.shake *= Math.pow(.02, rdt);
    ctx.save(); ctx.translate(sx, sy);
    if (this.showWalls) { ctx.save(); ctx.lineWidth = 2*DPR; ctx.strokeStyle = 'rgba(226,89,111,.9)'; ctx.fillStyle = 'rgba(226,89,111,.10)';
      for (const r of this.walls) { ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h); }
      if (this.EXT) { const B = this.pigBox(); ctx.strokeStyle = this.ghost ? 'rgba(63,184,232,.95)' : 'rgba(62,164,92,.95)'; ctx.strokeRect(B.x, B.y, B.w, B.h); }
      ctx.restore(); }
    // unlock glows ("záře"): a soft pulsing radial burst + a spinning ring, over the column slot
    for (const g of this.glows) { const u = g.t/1.6, r = (26+140*Math.sin(Math.min(1, u*1.3)*Math.PI/2))*DPR; const a = u < .15 ? u/.15 : Math.max(0, 1-(u-.15)/.85);
      const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r); grd.addColorStop(0, g.col+'ee'); grd.addColorStop(.45, g.col+'88'); grd.addColorStop(1, g.col+'00');
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#FFF6EA'; ctx.lineWidth = 3*DPR; ctx.globalAlpha = a*.9; for (let k = 0; k < 8; k++) { const th = now*3+k*Math.PI/4, r1 = r*.55, r2 = r*.95; ctx.beginPath(); ctx.moveTo(g.x+Math.cos(th)*r1, g.y+Math.sin(th)*r1); ctx.lineTo(g.x+Math.cos(th)*r2, g.y+Math.sin(th)*r2); ctx.stroke(); }
      ctx.restore(); }
    if (this.shown) {
      // (the ground shadow under him is removed - his order)
      ctx.save(); ctx.globalAlpha = this.pigAlpha; this.drawRig(); ctx.restore(); }
    if (this.angel && I['angel_body'] && I['angel_wing']) { const bi = I['angel_body'], wi = I['angel_wing'], s = (0.66*750*GS)/bi.width; const d = this.dead;
      const a = d && d.phase === 'decay' ? Math.max(0, 1-d.t/1.4) : Math.min(1, this.angel.t/.5); const flap = Math.sin(this.angel.t*16)*.55;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(this.angel.x, this.angel.y); ctx.rotate(Math.sin(this.angel.t*2.2)*.08); ctx.scale(s, s); ctx.translate(-bi.width/2, -bi.height/2);
      const AX = 486, AY = 365, RX = 0, RY = 163; const wing = (ph, k) => { ctx.save(); ctx.translate(AX, AY); ctx.rotate(-.3+flap*ph); ctx.scale(k, k); ctx.drawImage(wi, -RX, -RY); ctx.restore(); };
      wing(-1, .8); ctx.drawImage(bi, 0, 0); wing(1, 1); ctx.restore(); }
    for (const c of this.confetti) { ctx.save(); ctx.globalAlpha = c.rest > 1.5 ? Math.max(0, 1-(c.rest-1.5)) : 1; ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.col; ctx.fillRect(-c.w/2, -c.h/2, c.w, c.h); ctx.restore(); }
    for (const q of this.parts) { if (q.kind === 'grenade') { const im = I['weapon_grenade']; const s = .45*this.IS; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.t*6); ctx.drawImage(im, -im.width*s/2, -im.height*s/2, im.width*s, im.height*s); ctx.restore(); } }
    if (this._rope && I['whip_straight']) { const R = this._rope, im = I['whip_straight'], SW = im.width/(R.N-1);
      for (let i = R.N-2; i >= 0; i--) { const a = R.pts[i], b = R.pts[i+1]; const segLen = Math.hypot(b.x-a.x, b.y-a.y)+2*DPR; const ang = Math.atan2(b.y-a.y, b.x-a.x); const hScale = (R.seg*1.35)/im.height;
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang); ctx.drawImage(im, i*SW, 0, SW, im.height, 0, -im.height*hScale/2, segLen, im.height*hScale); ctx.restore(); } }
    for (const q of this.parts) { if (q.kind !== 'ring') continue; const u = q.t/.5; ctx.strokeStyle = 'rgba(232,89,63,'+(1-u)+')'; ctx.lineWidth = (10-8*u)*DPR; ctx.beginPath(); ctx.arc(q.x, q.y, u*640*GS, 0, 7); ctx.stroke(); }
    if (this.eat && this.shown) { const im = I[this.eat.crystal ? 'weapon_crystal' : 'suk']; if (im && im.width) { const s = .34*this.IS*(this.eat.phase === 'chew' ? Math.max(.18, 1-this.eat.bites/3) : 1);
      ctx.save(); ctx.translate(this.eat.dx || this.eat.x, this.eat.dy || this.eat.y); ctx.rotate(this.eat.phase === 'fly' ? this.eat.t*7 : -.3); ctx.drawImage(im, -im.width*s/2, -im.height*s/2, im.width*s, im.height*s); ctx.restore(); } }
    for (const q of this.fxs) { const im = I[q.key]; if (!im || !im.width) continue; const LT = q.life || .38, life = q.t/LT; let s = (0.55+Math.min(1, q.t/.08)*.6)*q.scale*GS*0.95; if (q.on !== 'pig') s *= 1.4;
      let px2 = q.x, py2 = q.y; if (q.on === 'pig') { if (!this.shown) continue; const w2 = apply(this.outerM(), q.rx, q.ry); px2 = w2[0]; py2 = w2[1]; }
      ctx.save(); ctx.globalAlpha = life > .7 ? (1-life)/.3 : 1; ctx.translate(px2, py2); ctx.rotate(q.rot); ctx.drawImage(im, -im.width*s/2, -im.height*s/2, im.width*s, im.height*s); ctx.restore(); }
    if (this.sprawl > 0 && I['e_dizzy'] && this.shown) { const hs = this.headScreen(), im = I['e_dizzy'], s = .5*GS; ctx.save(); ctx.translate(hs[0], hs[1]-40*GS); ctx.rotate(now*4%6.28); ctx.drawImage(im, -im.width*s/2, -im.height*s/2, im.width*s, im.height*s); ctx.restore(); }
    if (this.bubble && this.shown) { if (now > this.bubble.until) this.bubble = null; else {
      const [hx, hy] = this.headScreen(); ctx.font = '800 '+(15*DPR)+'px "Baloo 2", Nunito, sans-serif';
      const tw = ctx.measureText(this.bubble.t).width+26*DPR, bx = hx-tw/2, by = hy-48*DPR;
      ctx.fillStyle = '#FFF6EA'; ctx.strokeStyle = '#221E33'; ctx.lineWidth = 2.5*DPR;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 30*DPR, 10*DPR); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx-6*DPR, by+30*DPR); ctx.lineTo(hx+8*DPR, by+30*DPR); ctx.lineTo(hx, by+42*DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#221E33'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.bubble.t, hx, by+15*DPR); ctx.textAlign = 'start'; } }
    // the cursor sprite (only while a tool is held; the default cursor is the normal one)
    const w = this.tool; if (w && mx > -999 && this._inWin !== false) {
      const cs = this.IS;
      if (w.kind === 'hand') { const im = I[this.grab ? 'hand_fist' : 'hand_open']; const s = .42*cs; ctx.drawImage(im, mx-im.width*s/2, my-im.height*s*.25, im.width*s, im.height*s); }
      else if (w.kind === 'food' || w.kind === 'crystal') { const im = I[w.img]; if (im && im.width) { const s = .4*cs; ctx.drawImage(im, mx-im.width*s/2, my-im.height*s/2, im.width*s, im.height*s); } }
      else if (w.kind !== 'whip') { const im = I[w.img]; const u = (this.strike && this.strike.w === w) ? Math.min(1, this.strike.t/.16) : 0; const M = this.weaponM(w, u);
        ctx.save(); ctx.transform(M[0], M[3], M[1], M[4], M[2], M[5]); ctx.drawImage(im, 0, 0, im.width, im.height); ctx.restore(); } }
    ctx.restore();
    this.drawReveal(ctx, now); }
}
