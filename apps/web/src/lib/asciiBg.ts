// Draws a looping brightness clip (baked offline from video) as monochrome ASCII
// on a canvas. Glyphs are pre-rendered into a small atlas and blitted per cell,
// empty cells are skipped. Glyph colour is the canvas's CSS `color`.
// Ported from the ascii-koi-background handoff (docs/ascii-koi-background-handoff.zip).

export type AsciiClip = {
  w: number;
  h: number;
  fps: number;
  frames: number;
  levels: number;
  /** base64 of gzipped brightness levels, one byte per sample, frame after frame */
  data: string;
};

export type AsciiOptions = {
  /** Faint to dense; index 0 must be a space. */
  ramp: string;
  /** Cell size in CSS px. */
  fontSize: number;
  /** Cell height as a multiple of fontSize. */
  lineHeight: number;
  fontFamily: string;
  /** Alpha of the faintest glyph; the densest gets 1. */
  minAlpha: number;
  /** Render cap; the clip is blended between its own frames. */
  fps: number;
  speed: number;
  /** Which part of the clip stays in view when cropped, 0..1. */
  focusX: number;
  focusY: number;
  zoom: number;
  /** Multiplies brightness before glyph lookup; above 1 pushes faint ripples into visibility. */
  gain: number;
};

export const ASCII_DEFAULTS: AsciiOptions = {
  ramp: " .:-=+*#%@",
  fontSize: 12,
  lineHeight: 1.25,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  minAlpha: 0.35,
  fps: 30,
  speed: 1,
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
  gain: 1,
};

export type AsciiBg = {
  set(o: Partial<AsciiOptions>): Promise<void>;
  setClip(next: AsciiClip): Promise<void>;
  /** Re-read the CSS colour, e.g. after a theme switch. */
  refresh(): Promise<void>;
  destroy(): void;
};

async function decode(clip: AsciiClip): Promise<Uint8Array> {
  const bin = atob(clip.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Bilinear taps for each cell centre along one axis: the two source offsets
// (already multiplied by stride) and the weight of the second one.
function taps(count: number, cell: number, offset: number, scale: number, len: number, stride: number) {
  const i0 = new Int32Array(count);
  const i1 = new Int32Array(count);
  const wt = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const p = ((k + 0.5) * cell - offset) / scale - 0.5;
    const f = Math.floor(p);
    i0[k] = Math.min(len - 1, Math.max(0, f)) * stride;
    i1[k] = Math.min(len - 1, Math.max(0, f + 1)) * stride;
    wt[k] = p - f;
  }
  return [i0, i1, wt] as const;
}

export async function mountAsciiBg(
  canvas: HTMLCanvasElement,
  initialClip: AsciiClip,
  options: Partial<AsciiOptions> = {},
): Promise<AsciiBg> {
  const opts: AsciiOptions = { ...ASCII_DEFAULTS, ...options };
  let clip = initialClip;
  let frames = await decode(clip);
  let size = clip.w * clip.h;
  const ctx = canvas.getContext("2d")!;
  const atlas = document.createElement("canvas");
  const actx = atlas.getContext("2d")!;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let cw = 1;
  let ch = 1;
  let cols = 0;
  let rows = 0;
  let idxScale = 1;
  let xi0 = new Int32Array(0);
  let xi1 = new Int32Array(0);
  let xw = new Float32Array(0);
  let yi0 = new Int32Array(0);
  let yi1 = new Int32Array(0);
  let yw = new Float32Array(0);
  let raf = 0;
  let last = 0;
  let clock = 0;
  let destroyed = false;

  const fontSpec = () => `${opts.fontSize * (window.devicePixelRatio || 1)}px ${opts.fontFamily}`;

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));

    const n = opts.ramp.length;
    actx.font = fontSpec();
    cw = Math.max(1, Math.round(actx.measureText("M").width));
    ch = Math.max(1, Math.round(opts.fontSize * opts.lineHeight * dpr));
    atlas.width = cw * n;
    atlas.height = ch;
    actx.font = fontSpec();
    actx.fillStyle = getComputedStyle(canvas).color;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    for (let i = 1; i < n; i++) {
      actx.globalAlpha = opts.minAlpha + ((1 - opts.minAlpha) * (i - 1)) / Math.max(1, n - 2);
      actx.fillText(opts.ramp[i]!, i * cw + cw / 2, ch / 2);
    }
    idxScale = (n - 1) / (clip.levels - 1);

    // "Cover" fit of the clip onto the cell grid, like object-fit: cover.
    cols = Math.ceil(canvas.width / cw);
    rows = Math.ceil(canvas.height / ch);
    const s = Math.max(canvas.width / clip.w, canvas.height / clip.h) * opts.zoom;
    const ox = (canvas.width - clip.w * s) * opts.focusX;
    const oy = (canvas.height - clip.h * s) * opts.focusY;
    [xi0, xi1, xw] = taps(cols, cw, ox, s, clip.w, 1);
    [yi0, yi1, yw] = taps(rows, ch, oy, s, clip.h, clip.w);
  }

  function draw(ms: number) {
    const t = (ms / 1000) * clip.fps;
    const f = Math.floor(t);
    const A = (f % clip.frames) * size;
    const B = ((f + 1) % clip.frames) * size;
    const ft = t - f;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      const y0 = yi0[r]!;
      const y1 = yi1[r]!;
      const wy = yw[r]!;
      const dy = r * ch;
      for (let c = 0; c < cols; c++) {
        const p00 = y0 + xi0[c]!;
        const p01 = y0 + xi1[c]!;
        const p10 = y1 + xi0[c]!;
        const p11 = y1 + xi1[c]!;
        const wx = xw[c]!;
        const a0 = frames[A + p00]! + (frames[A + p01]! - frames[A + p00]!) * wx;
        const a1 = frames[A + p10]! + (frames[A + p11]! - frames[A + p10]!) * wx;
        const b0 = frames[B + p00]! + (frames[B + p01]! - frames[B + p00]!) * wx;
        const b1 = frames[B + p10]! + (frames[B + p11]! - frames[B + p10]!) * wx;
        const va = a0 + (a1 - a0) * wy;
        const v = va + (b0 + (b1 - b0) * wy - va) * ft;
        const idx = Math.min(opts.ramp.length - 1, (v * opts.gain * idxScale + 0.5) | 0);
        if (idx > 0) ctx.drawImage(atlas, idx * cw, 0, cw, ch, c * cw, dy, cw, ch);
      }
    }
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / opts.fps - 1) return;
    clock += Math.min(now - last, 100) * opts.speed; // no jump after a hidden tab
    last = now;
    draw(clock);
  }

  function play() {
    cancelAnimationFrame(raf);
    if (destroyed) return;
    if (reduceMotion.matches) draw(clock);
    else raf = requestAnimationFrame(tick);
  }

  async function refresh() {
    await document.fonts.load(fontSpec()).catch(() => {});
    if (destroyed) return;
    layout();
    play();
  }

  const ro = new ResizeObserver(() => void refresh());
  ro.observe(canvas);
  reduceMotion.addEventListener("change", play);
  await refresh();

  return {
    set(o) {
      Object.assign(opts, o);
      return refresh();
    },
    async setClip(next) {
      const data = await decode(next);
      clip = next;
      frames = data;
      size = clip.w * clip.h;
      clock = 0;
      return refresh();
    },
    refresh,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduceMotion.removeEventListener("change", play);
    },
  };
}
