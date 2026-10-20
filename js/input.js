// Keyboard, mouse and touch. Touch: a floating joystick on the left half of
// the screen, drag on the right half to turn the camera, tap to interact.
export class Input {
  constructor(el, joyEl, knobEl) {
    this.el = el; this.joyEl = joyEl; this.knobEl = knobEl;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.taps = [];
    this.pressed = new Set();
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.pointers = new Map();
    this.joyId = null; this.joyOrigin = null;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.moveP(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(e) {
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, type: e.pointerType };
    this.pointers.set(e.pointerId, p);
    if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && this.joyId === null) {
      this.joyId = e.pointerId; this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyEl.classList.remove('hidden'); this.joyEl.style.left = e.clientX + 'px'; this.joyEl.style.top = e.clientY + 'px';
      this.knobEl.style.transform = '';
      p.joy = true;
    }
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  moveP(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);
    if (p.joy) {
      let jx = e.clientX - this.joyOrigin.x, jy = e.clientY - this.joyOrigin.y;
      const R = 50, l = Math.hypot(jx, jy); if (l > R) { jx *= R / l; jy *= R / l; }
      this.knobEl.style.transform = `translate(${jx}px, ${jy}px)`;
      this.move.x = jx / R; this.move.y = -jy / R;
    } else {
      this.look.dx += dx; this.look.dy += dy;
    }
  }

  up(e, cancel) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.joy) { this.joyId = null; this.move.x = this.move.y = 0; this.joyEl.classList.add('hidden'); }
    if (!cancel && p.moved < 12 && performance.now() - p.t0 < 450) this.taps.push({ x: e.clientX, y: e.clientY });
  }

  axes() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y, run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') };
  }

  consume() {
    const r = { look: { ...this.look }, zoom: this.zoom, taps: this.taps, pressed: this.pressed };
    this.look.dx = this.look.dy = 0; this.zoom = 0; this.taps = []; this.pressed = new Set();
    return r;
  }
}
