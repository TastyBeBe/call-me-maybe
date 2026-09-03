import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getApi } from '../api';
import { audio } from '../audio';
import { useAuth } from '../auth';
import { LockIcon } from '../icons';
import { DANCES, PigRuntime, TOOLS } from './runtime';
import {
  COSMETICS, COS_PRICE, MILESTONES, TOP_COSMETIC, UNLOCKS, balance, dayWord,
  isUnlocked, loadProgress, progressFrac, progressLabel, requirement,
  saveProgress, tickTopDays, topDaysFor, type Counters, type Progress,
} from './progress';
import './pig.css';

const BASE = import.meta.env.BASE_URL + 'pig/';
window.addEventListener('error', (e) => { console.error('[pig] ' + ((e.error && e.error.stack) || e.message)); });
window.addEventListener('unhandledrejection', (e) => { const r = e.reason as { stack?: string } | undefined; console.error('[pig] rejection ' + ((r && r.stack) || String(e.reason))); });
const PIG_SCALE = 0.18;                        // css px per rig px

/** Albertův vlastní účet (users.id = 1, albertbrundaa@gmail.com).
 *  Jen on má odemčené všechny nástroje a tlačítko s tanci — NE každý admin,
 *  adminů je víc (Mikuláš). Session nenese username, jen id, jméno a roli,
 *  takže se to pozná podle id. Kdyby to měl mít někdo další, přidá se sem. */
const OWNER_USER_ID = 1;

/** názvy tanců pro Albertovo tlačítko */
const DANCE_LABEL: Record<string, string> = {
  dance_wave: 'Mává',
  dance_ovcacek: 'Ovčáček',
  dance_buckbuck: 'Buck buck',
  dance_twerk: 'Twerk',
  dance_handstand: 'Stojka',
  dance_ultratwerk: 'ULTRA TWERK',
};

interface Rect { x: number; y: number; w: number; h: number }

/**
 * ALL UI IS A WALL. Every rendered element that is not the page background (cards, inputs,
 * buttons, images, anything with a fill/border/shadow) and every line of plain TEXT becomes a
 * solid rectangle. A solid element's children are covered by its own rect, so the walk stops there.
 */
function collectWalls(): Rect[] {
  const root = document.getElementById('root');
  if (!root) return [];
  const out: Rect[] = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const push = (r: { x: number; y: number; width: number; height: number }) => {
    const x = Math.max(0, r.x), y = Math.max(0, r.y);
    const x2 = Math.min(vw, r.x + r.width), y2 = Math.min(vh, r.y + r.height);
    if (x2 - x >= 2 && y2 - y >= 2) out.push({ x, y, w: x2 - x, h: y2 - y });
  };
  const SOLID_TAGS = new Set(['IMG', 'SVG', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'CANVAS', 'HR']);
  const isSolid = (el: Element, cs: CSSStyleDeclaration) => {
    if (SOLID_TAGS.has(el.tagName.toUpperCase())) return true;
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(bg)) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      if (w > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') return true;
    }
    return false;
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!(node.textContent || '').trim()) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) push(r);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.hasAttribute('data-pig-canvas') || el.hasAttribute('data-pig-ui')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    if (isSolid(el, cs)) { push(el.getBoundingClientRect()); return; }
    for (const c of Array.from(el.childNodes)) walk(c);
  };
  walk(root);
  return out;
}

const THIRD_DEFAULT = 'glove';
const toolById = (id: string) => TOOLS.find((t) => t.id === id)!;
const toolImg = (id: string) => BASE + toolById(id).img + '.png';
const cosImg = (id: string) => BASE + id + '.png';

export default function PigLayer() {
  const { session } = useAuth();
  const location = useLocation();
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const rtRef = useRef<PigRuntime | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setToolState] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [real, setReal] = useState<Counters>({ calls: 0, accepted: 0, sold: 0 });
  const [progress, setProgressState] = useState<Progress>(loadProgress('anon'));
  const [closetOpen, setClosetOpen] = useState(false);
  const [dancesOpen, setDancesOpen] = useState(false);
  const [reveal, setReveal] = useState<{ kind: 'tool' | 'cos'; id: string; label: string; kicker?: string; sub?: string } | null>(null);
  const queueRef = useRef<string[]>([]);
  const dancingRef = useRef(false);
  const firedRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const uid = session?.user_id ?? null;
  const hasSession = !!session;
  const counters = real;
  const chops = balance(counters, progress);
  // Albert má všechno odemčené; ostatní si to musí odemknout hovory a prodeji.
  // POZOR na pořadí: `unlocked` čte `counters`, takže musí být AŽ ZA ním —
  // jinak je to TDZ ("Cannot access 'counters' before initialization"), což
  // tsc nechytí, PigBoundary to spolkne a Procop jen tiše zmizí.
  const isOwner = uid === OWNER_USER_ID;
  const unlocked = useCallback((id: string) => isOwner || isUnlocked(id, counters), [isOwner, counters]);

  /* ---------- runtime lifecycle (the canvas exists only while logged in) ---------- */
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !hasSession) return;
    const rt = new PigRuntime(cv, { base: BASE, scale: PIG_SCALE, sfxOn: () => audio.pigOn, sfxVol: () => audio.pigVolume });
    rtRef.current = rt;
    (window as unknown as { __pig?: PigRuntime }).__pig = rt;
    document.body.classList.add('pig-layer');
    let alive = true;
    rt.on('danceEnd', () => { dancingRef.current = false; setTimeout(() => nextDance(), 800); });
    void rt.load().then(() => { if (!alive) return; rt.start(); setReady(true); });
    return () => { alive = false; rt.destroy(); rtRef.current = null; setReady(false); document.body.classList.remove('pig-layer'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession]);

  /* ---------- per-user progress ---------- */
  useEffect(() => {
    if (uid === null) return;
    const p = loadProgress(uid);
    setProgressState(p);
    firedRef.current = new Set(p.fired);
    seenRef.current = new Set(p.seen);
  }, [uid]);
  const setProgress = useCallback((fn: (p: Progress) => Progress) => {
    setProgressState((p) => { const n = fn(p); if (uid !== null) saveProgress(uid, n); return n; });
  }, [uid]);

  /* ---------- the app's own numbers (demo or Supabase) ---------- */
  const refreshStats = useCallback(async () => {
    if (!session) return;
    try {
      const s = await getApi().myStats(session.token);
      setReal({ calls: s.calls, accepted: s.zajem, sold: s.sold });
    } catch { /* offline: keep the last numbers */ }
  }, [session]);
  useEffect(() => {
    void refreshStats();
    const onChange = () => { void refreshStats(); };
    window.addEventListener('cmm:data-changed', onChange);
    const iv = window.setInterval(() => { void refreshStats(); }, 30000);
    return () => { window.removeEventListener('cmm:data-changed', onChange); window.clearInterval(iv); };
  }, [refreshStats]);

  /* ---------- pig on/off + walls + walk-in ---------- */
  const pigOn = progress.pigOn;
  useEffect(() => { if (ready) rtRef.current?.setEnabled(pigOn && !!session); }, [ready, pigOn, session]);
  useEffect(() => { if (ready) rtRef.current?.setCos(progress.cos); }, [ready, progress.cos]);
  useEffect(() => {
    if (!ready) return;
    const rt = rtRef.current!;
    let raf = 0;
    const update = () => { raf = 0; rt.setWalls(collectWalls()); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const iv = window.setInterval(schedule, 500);
    update();
    return () => { mo.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.clearInterval(iv); if (raf) cancelAnimationFrame(raf); };
  }, [ready]);
  const firstRoute = useRef(true);
  useEffect(() => {
    if (!ready || !session) return;
    if (firstRoute.current) { firstRoute.current = false; if (pigOn) rtRef.current?.walkIn(); return; }
    if (pigOn) rtRef.current!.reenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, location.pathname]);

  /* ---------- tools ---------- */
  const setTool = useCallback((id: string | null) => {
    setToolState(id);
    rtRef.current?.setTool(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTool(null); setClosetOpen(false); setDancesOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);
  useEffect(() => { if (tool && !unlocked(tool)) setTool(null); }, [tool, unlocked, setTool]);

  /* ---------- milestones -> dances, unlocks -> the centre-screen reveal ---------- */
  const nextDance = useCallback(() => {
    const rt = rtRef.current;
    if (dancingRef.current && rt && !rt.party && !rt.visit && !rt.pendingDance) dancingRef.current = false;
    if (!rt || dancingRef.current) return;
    const d = queueRef.current.shift();
    if (!d) return;
    dancingRef.current = true;
    rt.dance(d);
  }, []);
  // reveals QUEUE: two firing at once used to leave the card's words on one item and the picture
  // on the next. One at a time, 3 s apart.
  const revealQ = useRef<{ kind: 'tool' | 'cos'; id: string; label: string; gold: boolean; kicker?: string; sub?: string }[]>([]);
  const revealBusy = useRef(false);
  const pumpReveal = useCallback(() => {
    if (revealBusy.current) return;
    const r = revealQ.current.shift();
    const rt = rtRef.current;
    if (!r || !rt) return;
    revealBusy.current = true;
    rt.revealItem(r.kind === 'tool' ? toolById(r.id).img : r.id, r.gold);
    setReveal(r);
    window.setTimeout(() => { setReveal(null); revealBusy.current = false; pumpReveal(); }, 2900);
  }, []);
  const showReveal = useCallback((kind: 'tool' | 'cos', id: string, label: string, gold = false, kicker?: string, sub?: string) => {
    revealQ.current.push({ kind, id, label, gold, kicker, sub });
    pumpReveal();
  }, [pumpReveal]);
  useEffect(() => {
    if (uid === null || !ready) return;
    const due = MILESTONES.filter((m) => !firedRef.current.has(m.id) && counters[m.counter] >= m.need);
    if (due.length) {
      for (const m of due) firedRef.current.add(m.id);
      setProgress((p) => ({ ...p, fired: Array.from(new Set([...p.fired, ...due.map((m) => m.id)])) }));
      // several at once (a debug jump, a first login with history) -> ONE party, the highest one's dance
      const last = due[due.length - 1];
      const rt = rtRef.current;
      const playing = rt && rt.party ? (rt.party as { name: string }).name : null;
      if (!queueRef.current.includes(last.dance) && playing !== last.dance) queueRef.current.push(last.dance);
      nextDance();
    }
    const fresh = Object.keys(UNLOCKS).filter((id) => UNLOCKS[id] && isUnlocked(id, counters) && !seenRef.current.has(id));
    if (fresh.length) {
      for (const id of fresh) seenRef.current.add(id);
      setProgress((p) => ({ ...p, seen: Array.from(new Set([...p.seen, ...fresh])) }));
      setExpanded(true);
      for (const id of fresh) showReveal('tool', id, toolById(id).nm);
    }
  }, [counters, uid, ready, setProgress, nextDance, showReveal]);

  /* ---------- #1 SELLER: the golden cap + the ULTRA TWERK ---------- */
  const awardTop = useCallback((on: boolean) => {
    setProgress((p) => {
      if (p.topSeller === on) return p;
      if (on) {
        const d = uid !== null ? topDaysFor(uid).days : 0;
        window.setTimeout(() => { showReveal('cos', TOP_COSMETIC, 'Swagger brýle', true); }, 200);
        window.setTimeout(() => {
          // HE tells you, in a bubble over his head (his ask - not a banner on the screen)
          rtRef.current?.announce(d > 1 ? `Gratuluju! Jsi #1 prodejce už ${d} ${dayWord(d)}!` : 'Gratuluju! Jsi #1 prodejce!', 6);
          queueRef.current.push('dance_ultratwerk'); nextDance();
        }, 1700);
        return { ...p, topSeller: true, owned: Array.from(new Set([...p.owned, TOP_COSMETIC])), cos: TOP_COSMETIC };
      }
      // outsold: the glasses go back
      return { ...p, topSeller: false, owned: p.owned.filter((o) => o !== TOP_COSMETIC), cos: p.cos === TOP_COSMETIC ? null : p.cos };
    });
  }, [setProgress, showReveal, nextDance]);
  useEffect(() => {
    if (!ready || !session || uid === null) return;
    let stop = false;
    const check = async () => {
      try {
        const rows = await getApi().allStats(session.token); // admin only; a caller just skips
        if (stop || !rows.length) return;
        const best = rows.reduce((a, b) => (b.sold > a.sold ? b : a));
        const mine = best.sold > 0 && best.user_id === session.user_id;
        for (const r of rows) tickTopDays(r.user_id, best.sold > 0 && r.user_id === best.user_id);
        awardTop(mine);
      } catch { /* not allowed for this role */ }
    };
    void check();
    const iv = window.setInterval(() => { void check(); }, 30000);
    const onChange = () => { void check(); };
    window.addEventListener('cmm:data-changed', onChange);
    return () => { stop = true; window.clearInterval(iv); window.removeEventListener('cmm:data-changed', onChange); };
  }, [ready, session, uid, awardTop]);

  /* ---------- the closet ---------- */
  const buy = useCallback((id: string) => {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c || c.price === null) return;
    if (progress.owned.includes(id)) { setProgress((p) => ({ ...p, cos: p.cos === id ? null : id })); rtRef.current?.play('plunger_stick', .6); return; }
    if (chops < c.price) { rtRef.current?.play('squeal_hit', .4); return; }
    setProgress((p) => ({ ...p, spent: (p.spent || 0) + c.price!, owned: [...p.owned, id], cos: id }));
    rtRef.current?.play('buy', .95);
    showReveal('cos', id, c.label);
  }, [progress.owned, chops, setProgress, showReveal]);

  if (!session) return null;

  const third = tool && tool !== 'hand' && tool !== 'suk' ? tool : THIRD_DEFAULT;
  const visible = expanded ? TOOLS.map((t) => t.id) : ['hand', 'suk', third];

  const slot = (id: string) => {
    const t = toolById(id);
    const isOpen = unlocked(id);
    const sel = tool === id;
    return (
      <button
        key={id}
        type="button"
        data-sfx="none"
        className={`pig-slot${sel ? ' sel' : ''}${isOpen ? '' : ' locked'}`}
        aria-label={t.nm}
        onClick={() => { if (!isOpen) return; setTool(sel ? null : id); rtRef.current?.play('plunger_stick', 0.6); }}
      >
        <img src={toolImg(id)} alt="" draggable={false} />
        {!unlocked && <span className="pig-lock"><LockIcon size={16} /></span>}
        <span className="pig-tip">
          <b>{t.nm}</b>
          {!unlocked && (<>
            <span className="req">{requirement(id)}</span>
            <span className="prog"><i style={{ width: `${Math.round(progressFrac(id, counters) * 100)}%` }} /></span>
            <span>{progressLabel(id, counters)}</span>
          </>)}
        </span>
      </button>
    );
  };

  return (
    <>
      <canvas ref={cvRef} className="pig-canvas" data-pig-canvas="" aria-hidden="true" />
      {reveal && (
        <div className="pig-reveal" data-pig-ui="">
          <p className="pig-reveal-kicker">{reveal.kicker ?? (reveal.kind === 'cos' ? 'nová čepice' : 'nový nástroj')}</p>
          <h2>{reveal.label}</h2>
          <p className="pig-reveal-sub">{reveal.sub ?? 'ODEMČENO!'}</p>
        </div>
      )}
      <div className="pig-col" data-pig-ui="">
        <div className="pig-col-slots">{visible.map(slot)}</div>
        <button type="button" className="pig-arrow" data-sfx="none" aria-label={expanded ? 'sbalit' : 'všechny nástroje'} onClick={() => setExpanded((e) => !e)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button type="button" className={`pig-closet${closetOpen ? ' open' : ''}`} data-sfx="none" title="Šatník" aria-label="Šatník" onClick={() => { setClosetOpen((o) => !o); rtRef.current?.play('plunger_stick', .6); }}>
          {/* a hanging coat on a hanger - Albert's icon for the closet */}
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 7a2 2 0 1 1 2-2" />
            <path d="M12 7 3.8 12.9a1 1 0 0 0 .6 1.8h15.2a1 1 0 0 0 .6-1.8L12 7z" />
          </svg>
        </button>
        {isOwner && (
          <button
            type="button"
            className={`pig-dance-btn${dancesOpen ? ' open' : ''}`}
            data-sfx="none"
            title="Tance"
            aria-label="Tance"
            aria-expanded={dancesOpen}
            onClick={() => { setDancesOpen((o) => !o); rtRef.current?.play('plunger_stick', .6); }}
          >
            {/* dvojitá nota - tancovat */}
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={`pig-power${pigOn ? ' on' : ''}`}
          data-sfx="none"
          title={pigOn ? 'Vypnout Procopa' : 'Zapnout Procopa'}
          aria-pressed={pigOn}
          onClick={() => { setProgress((p) => ({ ...p, pigOn: !p.pigOn })); rtRef.current?.play('plunger_stick', 0.6); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </button>
      </div>
      {isOwner && dancesOpen && (
        <div className="pig-dance-panel card" data-pig-ui="">
          <div className="pig-dance-head">
            <b>TANCE</b>
            <button type="button" className="pill-btn sm" data-sfx="none" onClick={() => setDancesOpen(false)}>zavřít</button>
          </div>
          <div className="pig-dance-grid">
            {DANCES.map((d) => (
              <button
                key={d}
                type="button"
                className="pig-dance-item"
                data-sfx="none"
                onClick={() => { queueRef.current.push(d); nextDance(); setDancesOpen(false); }}
              >
                {DANCE_LABEL[d] ?? d}
              </button>
            ))}
          </div>
          <p className="pig-dance-foot muted">Zatančí hned. Když zrovna tancuje, tenhle přijde na řadu potom.</p>
        </div>
      )}
      {closetOpen && (
        <Closet
          rt={rtRef.current}
          chops={chops}
          progress={progress}
          onBuy={buy}
          onWear={(id) => { setProgress((p) => ({ ...p, cos: id })); rtRef.current?.play('plunger_stick', .6); }}
          onClose={() => setClosetOpen(false)}
        />
      )}
    </>
  );
}

/* ---------- the CLOSET: him, wearing what you pick ---------- */
function Closet({ rt, chops, progress, onBuy, onWear, onClose }: {
  rt: PigRuntime | null; chops: number; progress: Progress;
  onBuy: (id: string) => void; onWear: (id: string | null) => void; onClose: () => void;
}) {
  const prevRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const shown = hover ?? progress.cos;
  useEffect(() => {
    const cv = prevRef.current;
    if (!cv || !rt) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    if (ctx) rt.renderPreview(ctx, cv.width, cv.height, shown);
  }, [rt, shown]);
  return (
    <div className="pig-closet-panel card" data-pig-ui="">
      <div className="pig-closet-head">
        <b>ŠATNÍK</b>
        <span className="pig-chops"><img src={BASE + 'prokchop.png'} alt="" /> {chops}</span>
        <button type="button" className="tb-btn" data-sfx="none" onClick={onClose} aria-label="zavřít">×</button>
      </div>
      <div className="pig-closet-body">
        <canvas ref={prevRef} className="pig-preview" />
        <div className="pig-closet-grid">
          <button type="button" data-sfx="none" className={`pig-cos${progress.cos === null ? ' sel' : ''}`} onClick={() => onWear(null)} onMouseEnter={() => setHover(null)}>
            <span className="pig-cos-ico">
              <svg width="40" height="34" viewBox="0 0 40 34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 22c0-7 5-12 11-12s11 5 11 12" /><path d="M5 22h30" /><path d="M7 6l26 24" />
              </svg>
            </span>
          </button>
          {COSMETICS.map((c) => {
            const owned = progress.owned.includes(c.id);
            const award = c.price === null;
            return (
              <button
                key={c.id}
                type="button"
                data-sfx="none"
                className={`pig-cos${progress.cos === c.id ? ' sel' : ''}${owned ? '' : ' locked'}`}
                onMouseEnter={() => setHover(owned ? c.id : null)}
                onMouseLeave={() => setHover(null)}
                onClick={() => (owned ? onWear(c.id) : onBuy(c.id))}
                title={c.label}
              >
                <span className="pig-cos-ico"><img src={cosImg(c.id)} alt="" draggable={false} /></span>
                <span className="pig-cos-lbl">{c.label}</span>
                {!owned && (
                  <span className="pig-cos-price">
                    {award ? 'jen pro #1 prodejce' : <><img src={BASE + 'prokchop.png'} alt="" />{COS_PRICE}</>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="pig-closet-foot muted">1 PROKCHOP za každý hovor · +2 když chtějí návrh · +10 za prodaný web</p>
    </div>
  );
}
