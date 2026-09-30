/**
 * Per-page browser tab identity: title + animated favicon.
 * The brand icon (public/brand/ai-chip.png) is composited on a canvas each
 * frame with a shine sweep + accent glow, then pushed to link[rel=icon] —
 * this animates in Chrome/Edge/Firefox, unlike static SMIL.
 */

type Ctx = CanvasRenderingContext2D;

const ICON_SRC = '/brand/ai-chip.png';

let canvas: HTMLCanvasElement | null = null;
let ctx: Ctx | null = null;
let timer: number | undefined;
let iconImg: HTMLImageElement | null = null;
let iconReady = false;
let currentColors: [string, string] = ['#06b6d4', '#3b82f6'];

function loadIcon(cb: () => void) {
  if (iconImg) return cb();
  iconImg = new Image();
  iconImg.onload = () => {
    iconReady = true;
    cb();
  };
  iconImg.onerror = () => cb();
  iconImg.src = ICON_SRC;
}

function roundedTile(c: Ctx, size: number, r: number) {
  c.beginPath();
  c.moveTo(r, 0);
  c.arcTo(size, 0, size, size, r);
  c.arcTo(size, size, 0, size, r);
  c.arcTo(0, size, 0, 0, r);
  c.arcTo(0, 0, size, 0, r);
  c.closePath();
}

function drawFrame(t: number) {
  if (!canvas || !ctx) return;
  const size = 64;
  ctx.clearRect(0, 0, size, size);

  roundedTile(ctx, size, 15);
  ctx.save();
  ctx.clip();

  // brand icon fills the tile (with a soft breathing scale)
  const breathe = 1 + 0.025 * Math.sin(t * Math.PI * 2);
  const s = size * breathe;
  if (iconReady && iconImg) {
    ctx.drawImage(iconImg, (size - s) / 2, (size - s) / 2, s, s);
  } else {
    // fallback tile while the PNG loads
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, currentColors[0]);
    g.addColorStop(1, currentColors[1]);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // diagonal shine sweep every cycle
  const sweep = (t * 2) % 1;
  const sx = -size + sweep * size * 2.4;
  const shine = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
  shine.addColorStop(0, 'rgba(255,255,255,0)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // pulsing accent ring in the active mode's color
  const glow = 0.35 + 0.4 * Math.abs(Math.sin(t * Math.PI * 2));
  ctx.save();
  roundedTile(ctx, size - 3, 14);
  ctx.translate(1.5, 1.5);
  ctx.strokeStyle = currentColors[0];
  ctx.globalAlpha = glow;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // push to favicon
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}

function startAnimation() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    ctx = canvas.getContext('2d');
  }
  if (timer !== undefined) window.clearInterval(timer);
  const DUR = 2600; // one full animation cycle (ms)
  const FRAME = 140; // ~7fps — plenty for a favicon, light on CPU
  timer = window.setInterval(() => {
    const t = (performance.now() % DUR) / DUR;
    drawFrame(t);
  }, FRAME);
  loadIcon(() => drawFrame(0));
  drawFrame(0); // first frame immediately
}

export function setPageMeta(
  title: string,
  colors: [string, string] = ['#06b6d4', '#3b82f6'],
  _glyph?: string
) {
  document.title = title;
  currentColors = colors;
  startAnimation();
}

/** Accent ring color per mode — the brand icon stays consistent */
export const PRODUCT_META: Record<string, { colors: [string, string]; glyph: string }> = {
  unified: { colors: ['#06b6d4', '#3b82f6'], glyph: 'bot' },
  assistant: { colors: ['#3b82f6', '#4f46e5'], glyph: 'lightbulb' },
  search: { colors: ['#10b981', '#0d9488'], glyph: 'search' },
  agent: { colors: ['#8b5cf6', '#9333ea'], glyph: 'cpu' },
};
