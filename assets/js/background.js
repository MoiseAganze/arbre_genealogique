// =====================================================================
//  Fond animé : galaxie étoilée (thème sombre) / ciel ensoleillé et
//  nuageux (thème clair). Un seul canvas, fondu enchaîné entre les deux.
// =====================================================================
import { prefersReducedMotion } from './core.js';

const rand = (a, b) => a + Math.random() * (b - a);

class Sky {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.offset = { x: 0, y: 0 };
    this.smooth = { x: 0, y: 0 };
    this.mix = document.documentElement.classList.contains('dark') ? 1 : 0;
    this.target = this.mix;
    this.shooting = [];
    this.birds = [];
    this.nextShoot = performance.now() + 2500;
    this.nextBirds = performance.now() + 6000;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => !document.hidden && this.loop());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setTheme(dark) {
    this.target = dark ? 1 : 0;
    if (prefersReducedMotion()) { this.mix = this.target; this.draw(performance.now()); }
  }

  setOffset(x, y) {
    this.offset.x = x;
    this.offset.y = y;
    if (prefersReducedMotion()) this.draw(performance.now());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.dpr = dpr;
    this.w = Math.max(2, window.innerWidth);
    this.h = Math.max(2, window.innerHeight);
    this.c.width = this.w * dpr;
    this.c.height = this.h * dpr;
    this.c.style.width = `${this.w}px`;
    this.c.style.height = `${this.h}px`;
    this.buildGalaxy();
    this.buildSky();
    this.draw(performance.now());
  }

  // -----------------------------------------------------------------
  //  Galaxie
  // -----------------------------------------------------------------
  buildGalaxy() {
    const area = this.w * this.h;
    const count = Math.min(900, Math.round(area / 2200));
    const tints = ['255,255,255', '200,220,255', '255,236,210', '210,200,255', '180,230,255'];
    this.stars = Array.from({ length: count }, () => {
      const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.75 ? 1 : 2;
      return {
        x: Math.random(), y: Math.random(), layer,
        r: layer === 0 ? rand(0.3, 0.8) : layer === 1 ? rand(0.6, 1.2) : rand(1, 1.8),
        a: rand(0.35, 1), sp: rand(0.4, 2.2), ph: rand(0, Math.PI * 2),
        tint: tints[(Math.random() * tints.length) | 0],
      };
    });
    this.bright = Array.from({ length: Math.max(6, Math.round(area / 90000)) }, () => ({
      x: Math.random(), y: Math.random(), r: rand(1.4, 2.4), sp: rand(0.3, 0.9), ph: rand(0, 6),
      tint: Math.random() < 0.5 ? '190,215,255' : '255,225,190',
    }));

    // Nébuleuses et voie lactée pré-dessinées (performances)
    const off = document.createElement('canvas');
    const W = (off.width = Math.ceil(this.w * 1.2));
    const H = (off.height = Math.ceil(this.h * 1.2));
    const g = off.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#05061a');
    bg.addColorStop(0.5, '#0a0b2e');
    bg.addColorStop(1, '#120826');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const blob = (x, y, r, color, alpha) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${color},${alpha})`);
      rg.addColorStop(0.45, `rgba(${color},${alpha * 0.4})`);
      rg.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // Bande de la voie lactée en diagonale
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-0.42);
    for (let i = 0; i < 26; i++) {
      const bx = rand(-W * 0.7, W * 0.7);
      const by = rand(-H * 0.08, H * 0.08);
      blob(bx, by, rand(120, 260), i % 3 === 0 ? '120,90,220' : i % 3 === 1 ? '70,110,230' : '200,120,210', rand(0.05, 0.12));
    }
    for (let i = 0; i < 1400; i++) {
      const bx = rand(-W * 0.8, W * 0.8);
      const by = (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.13;
      g.fillStyle = `rgba(255,255,255,${rand(0.05, 0.35)})`;
      g.fillRect(bx, by, rand(0.4, 1.2), rand(0.4, 1.2));
    }
    g.restore();
    blob(W * 0.15, H * 0.25, Math.max(W, H) * 0.35, '110,60,200', 0.18);
    blob(W * 0.85, H * 0.75, Math.max(W, H) * 0.32, '40,90,210', 0.16);
    blob(W * 0.7, H * 0.15, Math.max(W, H) * 0.22, '210,80,160', 0.09);
    blob(W * 0.3, H * 0.85, Math.max(W, H) * 0.25, '30,140,190', 0.08);
    this.galaxyBg = off;
  }

  drawGalaxy(t, alpha) {
    const { ctx, w, h } = this;
    ctx.globalAlpha = alpha;
    const ox = this.smooth.x;
    const oy = this.smooth.y;
    const bgx = -((ox * 0.015) % (w * 0.1)) - w * 0.1;
    const bgy = -((oy * 0.015) % (h * 0.1)) - h * 0.1;
    ctx.drawImage(this.galaxyBg, bgx, bgy);

    const par = [0.01, 0.025, 0.05];
    for (const s of this.stars) {
      const px = (((s.x * w + ox * par[s.layer]) % w) + w) % w;
      const py = (((s.y * h + oy * par[s.layer]) % h) + h) % h;
      const tw = 0.55 + 0.45 * Math.sin(t * 0.001 * s.sp + s.ph);
      ctx.fillStyle = `rgba(${s.tint},${s.a * tw * alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Étoiles brillantes avec aigrettes
    for (const s of this.bright) {
      const px = (((s.x * w + ox * 0.06) % w) + w) % w;
      const py = (((s.y * h + oy * 0.06) % h) + h) % h;
      const tw = 0.6 + 0.4 * Math.sin(t * 0.001 * s.sp + s.ph);
      const R = s.r * 6 * tw;
      const rg = ctx.createRadialGradient(px, py, 0, px, py, R);
      rg.addColorStop(0, `rgba(${s.tint},${0.9 * alpha})`);
      rg.addColorStop(0.2, `rgba(${s.tint},${0.25 * alpha})`);
      rg.addColorStop(1, `rgba(${s.tint},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
      ctx.strokeStyle = `rgba(${s.tint},${0.35 * tw * alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px - R * 1.6, py); ctx.lineTo(px + R * 1.6, py);
      ctx.moveTo(px, py - R * 1.6); ctx.lineTo(px, py + R * 1.6);
      ctx.stroke();
    }

    // Étoiles filantes
    if (t > this.nextShoot && !prefersReducedMotion()) {
      this.nextShoot = t + rand(3500, 9000);
      const ang = rand(0.25, 0.7);
      this.shooting.push({ x: rand(w * 0.1, w * 0.9), y: rand(0, h * 0.45), vx: Math.cos(ang) * rand(9, 14), vy: Math.sin(ang) * rand(9, 14), life: 0, max: rand(45, 75) });
    }
    this.shooting = this.shooting.filter((s) => s.life < s.max);
    for (const s of this.shooting) {
      s.life++;
      s.x += s.vx;
      s.y += s.vy;
      const fade = Math.sin((s.life / s.max) * Math.PI);
      const tail = 14;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
      grad.addColorStop(0, `rgba(255,255,255,${0.95 * fade * alpha})`);
      grad.addColorStop(1, 'rgba(160,180,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // -----------------------------------------------------------------
  //  Ciel ensoleillé
  // -----------------------------------------------------------------
  buildSky() {
    const off = document.createElement('canvas');
    off.width = this.w;
    off.height = this.h;
    const g = off.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, '#2f7fe0');
    grad.addColorStop(0.45, '#6fb4f2');
    grad.addColorStop(0.8, '#b9e0fb');
    grad.addColorStop(1, '#e6f5ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.w, this.h);
    this.skyBg = off;

    const cloudCount = Math.max(7, Math.round(this.w / 180));
    this.clouds = Array.from({ length: cloudCount }, (_, i) => this.makeCloud(i % 3, Math.random()));
  }

  makeCloud(layer, xFrac) {
    const scale = [0.55, 0.85, 1.25][layer] * rand(0.8, 1.25);
    const W = Math.round(260 * scale);
    const H = Math.round(130 * scale);
    const off = document.createElement('canvas');
    off.width = W + 40;
    off.height = H + 40;
    const g = off.getContext('2d');
    const puffs = 7 + ((Math.random() * 5) | 0);
    const base = H * 0.72 + 20;
    // Ombre de base
    for (let i = 0; i < puffs; i++) {
      const px = 20 + W * (0.12 + (0.76 * i) / (puffs - 1)) + rand(-8, 8) * scale;
      const center = 1 - Math.abs(i / (puffs - 1) - 0.5) * 2;
      const pr = (28 + 34 * center + rand(-6, 10)) * scale;
      const py = base - pr * rand(0.55, 0.9);
      const rg = g.createRadialGradient(px - pr * 0.25, py - pr * 0.35, pr * 0.1, px, py, pr);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.65, 'rgba(250,252,255,0.97)');
      rg.addColorStop(1, 'rgba(214,230,246,0.0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();
    }
    // Ventre légèrement bleuté
    const belly = g.createLinearGradient(0, base - 30 * scale, 0, base + 6);
    belly.addColorStop(0, 'rgba(205,222,242,0)');
    belly.addColorStop(1, 'rgba(190,210,236,0.55)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = belly;
    g.fillRect(0, 0, off.width, off.height);
    g.globalCompositeOperation = 'source-over';

    return {
      img: off, layer, x: xFrac * (this.w + off.width) - off.width,
      y: rand(0.04, 0.62) * this.h * (layer === 2 ? 0.8 : 1),
      speed: [0.08, 0.16, 0.28][layer] * rand(0.8, 1.2),
      alpha: [0.75, 0.88, 0.96][layer],
    };
  }

  drawSky(t, alpha) {
    const { ctx, w, h } = this;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.skyBg, 0, 0, w, h);

    // Soleil
    const sx = w * 0.84 + this.smooth.x * 0.004;
    const sy = h * 0.16 + this.smooth.y * 0.004;
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.55);
    halo.addColorStop(0, `rgba(255,248,214,${0.85 * alpha})`);
    halo.addColorStop(0.08, `rgba(255,236,170,${0.55 * alpha})`);
    halo.addColorStop(0.3, `rgba(255,230,170,${0.12 * alpha})`);
    halo.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Rayons tournants
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(t * 0.00004);
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      ctx.rotate((Math.PI * 2) / rays);
      const len = Math.max(w, h) * (i % 2 ? 0.5 : 0.75);
      const rg = ctx.createLinearGradient(0, 0, len, 0);
      rg.addColorStop(0, `rgba(255,250,220,${0.16 * alpha})`);
      rg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, -len * 0.06);
      ctx.lineTo(len, len * 0.06);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, 52);
    core.addColorStop(0, `rgba(255,255,250,${alpha})`);
    core.addColorStop(0.55, `rgba(255,246,200,${alpha})`);
    core.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sx, sy, 52, 0, Math.PI * 2);
    ctx.fill();

    // Nuages (trois plans, parallaxe)
    const still = prefersReducedMotion();
    const par = [0.02, 0.05, 0.1];
    for (const cl of this.clouds) {
      if (!still) cl.x += cl.speed;
      const span = w + cl.img.width;
      if (cl.x > w + 20) {
        Object.assign(cl, this.makeCloud(cl.layer, 0), { x: -cl.img.width });
      }
      const px = ((((cl.x + this.smooth.x * par[cl.layer]) + cl.img.width) % span) + span) % span - cl.img.width;
      const py = cl.y + this.smooth.y * par[cl.layer] * 0.6;
      ctx.globalAlpha = alpha * cl.alpha;
      ctx.drawImage(cl.img, px, py);
    }
    ctx.globalAlpha = alpha;

    // Petits oiseaux de passage
    if (t > this.nextBirds && !still) {
      this.nextBirds = t + rand(14000, 26000);
      const y0 = rand(h * 0.12, h * 0.4);
      const n = 3 + ((Math.random() * 4) | 0);
      this.birds = Array.from({ length: n }, (_, i) => ({ x: -40 - i * rand(18, 30), y: y0 + rand(-25, 25), ph: rand(0, 6), s: rand(0.7, 1.1) }));
    }
    ctx.strokeStyle = `rgba(40,60,90,${0.55 * alpha})`;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    this.birds = this.birds.filter((b) => b.x < w + 60);
    for (const b of this.birds) {
      b.x += 1.1 * b.s;
      b.y += Math.sin(t * 0.001 + b.ph) * 0.15;
      const flap = Math.sin(t * 0.012 + b.ph) * 4 * b.s;
      ctx.beginPath();
      ctx.moveTo(b.x - 7 * b.s, b.y - flap);
      ctx.quadraticCurveTo(b.x - 3 * b.s, b.y - 2, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 3 * b.s, b.y - 2, b.x + 7 * b.s, b.y - flap);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // -----------------------------------------------------------------
  draw(t) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.smooth.x += (this.offset.x - this.smooth.x) * 0.08;
    this.smooth.y += (this.offset.y - this.smooth.y) * 0.08;
    if (this.mix < 1) this.drawSky(t, 1);
    if (this.mix > 0) this.drawGalaxy(t, this.mix);
  }

  loop(t = performance.now()) {
    if (document.hidden) return;
    if (this.mix !== this.target) {
      const d = this.target - this.mix;
      this.mix = Math.abs(d) < 0.01 ? this.target : this.mix + d * 0.06;
    }
    if (prefersReducedMotion()) {
      this.draw(t);
      return; // image fixe, redessinée seulement au besoin
    }
    this.draw(t);
    requestAnimationFrame(this.loop);
  }
}

let sky = null;
export function initSky() {
  const c = document.getElementById('sky');
  if (c && !sky) sky = new Sky(c);
  return sky;
}
export const getSky = () => sky;
