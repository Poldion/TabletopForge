// Eingabesteuerung für Kartenansichten: Maus, Touch (Pinch/Pan) und aktive Stifte (S Pen).
// Sobald ein Stift erkannt wurde, dienen Finger nur noch zum Verschieben/Zoomen (Handballen-Erkennung).

const MIN_SCALE = 0.02;
const MAX_SCALE = 12;

export class Viewport {
  /**
   * @param {import('./maprender.js').MapRenderer} renderer
   * @param {object} handlers
   *   onToolDown(e, pt), onToolMove(e, pt, samples), onToolUp(e, pt), onToolCancel(), onHover(pt),
   *   isPanTool(): boolean, onViewChange()
   */
  constructor(renderer, handlers = {}) {
    this.r = renderer;
    this.h = handlers;
    this.canvas = renderer.canvas;
    this.pointers = new Map();
    this.mode = null; // 'tool' | 'pan' | 'pinch'
    this.toolPointer = null;
    this.penSeen = false;
    this.stylusOnly = false;
    this.lastPinch = null;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const m = this.r.screenToMap(sx, sy);
    return { sx, sy, x: m.x, y: m.y, pressure: e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5, type: e.pointerType };
  }

  down(e) {
    if (e.pointerType === 'pen') {
      this.penSeen = true;
      this.stylusOnly = true;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* z.B. bereits beendeter Zeiger */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');

    if (e.pointerType === 'touch' && touches.length >= 2) {
      if (this.mode === 'tool') this.h.onToolCancel?.();
      this.mode = 'pinch';
      this.toolPointer = null;
      this.lastPinch = null;
      return;
    }
    if (this.mode) return;

    const panByButton = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
    const fingerWhileStylus = e.pointerType === 'touch' && this.stylusOnly;
    if (panByButton || fingerWhileStylus || this.h.isPanTool?.(e)) {
      this.mode = 'pan';
      // Im Pan-Werkzeug darf ein Klick trotzdem Objekte auswählen/verschieben
      if (!panByButton && !fingerWhileStylus && this.h.onPanToolDown?.(e, this.pt(e))) {
        this.mode = 'tool';
        this.toolPointer = e.pointerId;
      }
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.mode = 'tool';
    this.toolPointer = e.pointerId;
    this.h.onToolDown?.(e, this.pt(e));
  }

  move(e) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType !== 'touch') this.h.onHover?.(this.pt(e));
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.mode === 'pinch') {
      const ts = [...this.pointers.values()].filter((p) => p.type === 'touch');
      if (ts.length < 2) return;
      const [a, b] = ts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.lastPinch) {
        const rect = this.canvas.getBoundingClientRect();
        this.zoomAt(mid.x - rect.left, mid.y - rect.top, dist / this.lastPinch.dist);
        this.panBy(mid.x - this.lastPinch.mid.x, mid.y - this.lastPinch.mid.y);
      }
      this.lastPinch = { dist, mid };
    } else if (this.mode === 'pan') {
      this.panBy(dx, dy);
    } else if (this.mode === 'tool' && e.pointerId === this.toolPointer) {
      const samples = (e.getCoalescedEvents?.() || [e]).map((ce) => this.pt(ce));
      this.h.onToolMove?.(e, this.pt(e), samples.length ? samples : [this.pt(e)]);
    }
  }

  up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'tool' && e.pointerId === this.toolPointer) {
      if (cancelled) this.h.onToolCancel?.();
      else this.h.onToolUp?.(e, this.pt(e));
      this.toolPointer = null;
      this.mode = null;
    } else if (this.mode === 'pinch') {
      if ([...this.pointers.values()].filter((p) => p.type === 'touch').length < 2) {
        this.lastPinch = null;
        this.mode = this.pointers.size ? 'pan' : null;
      }
    } else if (this.mode === 'pan' && this.pointers.size === 0) {
      this.mode = null;
    }
    if (this.pointers.size === 0) this.mode = null;
  }

  wheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    if (e.ctrlKey || !e.shiftKey) {
      // Mausrad bzw. Trackpad-Pinch zoomt um den Cursor
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    } else {
      this.panBy(-e.deltaX, -e.deltaY);
    }
  }

  panBy(dx, dy) {
    const { scale } = this.r.view;
    this.r.setView({ cx: this.r.view.cx - dx / scale, cy: this.r.view.cy - dy / scale });
    this.h.onViewChange?.();
  }

  zoomAt(sx, sy, factor) {
    const before = this.r.screenToMap(sx, sy);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.r.view.scale * factor));
    this.r.view.scale = scale;
    this.r.setView({
      cx: before.x - (sx - this.r.width / 2) / scale,
      cy: before.y - (sy - this.r.height / 2) / scale,
    });
    this.h.onViewChange?.();
  }
}
