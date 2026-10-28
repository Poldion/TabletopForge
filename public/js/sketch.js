// Handschriftlicher Notizblock (Stift, Touch, Maus). Striche liegen in logischen Koordinaten
// (Breite 1000), damit sie auf allen Geräten gleich aussehen.
import { h, uid } from './util.js';
import { drawStroke } from './maprender.js';
import { icon } from './icons.js';
import { tr } from './i18n.js';

const LOGICAL_W = 1000;
const LOGICAL_H = 700;

export function sketchPad(sync, getPath) {
  const canvas = h('canvas', { style: { width: '100%', aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}`, background: '#f3ead6', borderRadius: '8px', touchAction: 'none', display: 'block' } });
  const ctx = canvas.getContext('2d');
  let color = '#1d2a4a';
  let width = 3;
  let erasing = false;
  let current = null;
  let penSeen = false;
  let lastSend = 0;
  let pending = [];

  const strokes = () => {
    let o = sync.state;
    for (const k of getPath()) o = o?.[k];
    return o || {};
  };

  const render = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    if (!w) return;
    const hh = (w * LOGICAL_H) / LOGICAL_W;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hh * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = (w * dpr) / LOGICAL_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.strokeStyle = '#d9cdb2';
    ctx.lineWidth = 1;
    for (let y = 40; y < LOGICAL_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_W, y);
      ctx.stroke();
    }
    for (const s of Object.values(strokes())) drawStroke(ctx, s);
  };

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = LOGICAL_W / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
  };

  const flush = () => {
    if (!current || !pending.length) return;
    sync.send({ t: 'push', p: [...getPath(), current, 'pts'], v: pending });
    pending = [];
    lastSend = performance.now();
  };

  const eraseAt = ([x, y]) => {
    const ops = [];
    for (const [id, s] of Object.entries(strokes())) {
      const p = s.pts || [];
      for (let i = 0; i < p.length; i += 3) {
        if (Math.hypot(p[i] - x, p[i + 1] - y) < 14) {
          ops.push({ t: 'del', p: [...getPath(), id] });
          break;
        }
      }
    }
    if (ops.length) sync.do(ops);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch' && penSeen) return; // Handballen ignorieren
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignorieren */
    }
    const p = pt(e);
    if (erasing || e.button === 5 || e.buttons === 32) {
      current = 'erase';
      eraseAt(p);
      return;
    }
    current = uid();
    sync.set([...getPath(), current], { id: current, color, w: width, pts: p });
    lastSend = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current || !(e.buttons || e.pressure)) return;
    if (current === 'erase') return eraseAt(pt(e));
    // lokal sofort zeichnen, gebündelt senden
    const pts = (e.getCoalescedEvents?.() || [e]).flatMap(pt);
    sync.local({ t: 'push', p: [...getPath(), current, 'pts'], v: pts });
    pending.push(...pts);
    if (performance.now() - lastSend > 50) flush();
  });
  const end = () => {
    if (current !== 'erase') flush();
    current = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  new ResizeObserver(render).observe(canvas);

  const colors = ['#1d2a4a', '#b3261e', '#2e7d32', '#6a1b9a', '#e0a030'];
  const eraseBtn = h('button.small', icon('eraser'), tr(' Radierer'));
  eraseBtn.addEventListener('click', () => {
    erasing = !erasing;
    eraseBtn.classList.toggle('active', erasing);
  });
  const swatches = colors.map((c) =>
    h('button.swatch', {
      style: { background: c },
      class: c === color ? 'active' : '',
      onclick: (e) => {
        color = c;
        erasing = false;
        eraseBtn.classList.remove('active');
        swatches.forEach((s) => s.classList.toggle('active', s === e.currentTarget));
      },
    }),
  );
  const widthSel = h('select', { style: { width: '90px' } }, h('option', { value: 2 }, tr('fein')), h('option', { value: 3, selected: true }, tr('normal')), h('option', { value: 6 }, tr('dick')));
  widthSel.addEventListener('change', () => (width = Number(widthSel.value)));
  const clearBtn = h('button.small', {
    onclick: () => {
      if (confirm(tr('Notizblatt leeren?'))) {
        const path = getPath();
        sync.set(path, {});
      }
    },
  }, tr('Leeren'));

  // Vollbild: echtes Vollbild des Browsers (blendet Adressleiste usw. aus), sonst über die ganze Seite gelegt
  const fullBtn = h('button.small', { title: tr('Notizblatt im Vollbild') }, icon('maximize'), tr(' Vollbild'));
  const setFull = (on) => {
    el.classList.toggle('sketch-full', on);
    fullBtn.replaceChildren(icon(on ? 'x' : 'maximize'), on ? tr(' Schließen') : tr(' Vollbild'));
  };
  fullBtn.addEventListener('click', () => {
    const on = !el.classList.contains('sketch-full');
    setFull(on);
    if (on) el.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  // Vollbild per Zurück-/Esc-Taste verlassen → Ansicht auch zurückstellen
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && el.classList.contains('sketch-full')) setFull(false);
  });

  const el = h('div', h('div.row', { style: { marginBottom: '6px' } }, ...swatches, widthSel, eraseBtn, h('span.spacer'), fullBtn, clearBtn), canvas);
  return { el, render };
}
