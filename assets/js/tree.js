// =====================================================================
//  Rendu de l'arbre : cartes HTML + liens SVG, caméra (déplacement,
//  zoom, pincement, inertie), transitions animées et mini-carte.
// =====================================================================
import { store } from './store.js';
import { computeLayout } from './layout.js';
import { esc, avatarHtml, fullName, lifespan, age, icon, genderize, hue, UNION_TYPES, UNION_STATUSES, formatDate, prefersReducedMotion } from './core.js';

const MIN_K = 0.12;
const MAX_K = 2.4;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class TreeView {
  constructor({ viewport, world, nodesEl, linksEl, minimap, onSelect, onFocus, onAdd, onUnion, onCamera }) {
    Object.assign(this, { viewport, world, nodesEl, linksEl, minimap, onSelect, onFocus, onAdd, onUnion, onCamera });
    this.cam = { x: 0, y: 0, k: 1 };
    this.layout = null;
    this.focusId = null;
    this.selectedId = null;
    this.elements = new Map();
    this.anim = null;
    this.options = { up: 3, down: 4, siblings: true, compact: false, collapsed: new Set() };
    this.bindPointer();
    this.bindNodes();
    this.bindMinimap();
    new ResizeObserver(() => this.drawMinimap()).observe(viewport);
  }

  // ---------------------------------------------------------------
  //  Rendu
  // ---------------------------------------------------------------
  render({ focusId = this.focusId, animate = true, recenter = false } = {}) {
    if (!focusId || !store.person(focusId)) return;
    const previous = this.layout;
    const prevFocus = this.focusId;
    this.focusId = focusId;
    const layout = computeLayout(focusId, { ...this.options, canAdd: !!store.perms.add });
    this.layout = layout;
    const { S } = layout;
    this.world.style.setProperty('--card-w', `${S.W}px`);
    this.world.style.setProperty('--card-h', `${S.H}px`);
    this.world.classList.toggle('is-compact', this.options.compact);

    const reduce = prefersReducedMotion() || !animate;

    // FLIP : si on change de centre, on décale l'ancien repère pour que rien ne saute
    let shift = { x: 0, y: 0 };
    if (previous && prevFocus !== focusId) {
      const old = previous.nodes.find((n) => n.pid === focusId);
      if (old) shift = { x: old.x, y: old.y };
    }
    if (shift.x || shift.y) {
      this.cam.x += shift.x * this.cam.k;
      this.cam.y += shift.y * this.cam.k;
      this.applyCamera();
      for (const el of this.elements.values()) {
        el.style.transition = 'none';
        el._x -= shift.x;
        el._y -= shift.y;
        el.style.transform = `translate(${el._x}px, ${el._y}px)`;
      }
      void this.nodesEl.offsetWidth; // force la mise en page
    }

    const alive = new Set();
    const place = (key, x, y, make, update) => {
      alive.add(key);
      let el = this.elements.get(key);
      const isNew = !el;
      if (isNew) {
        el = make();
        el.dataset.key = key;
        this.elements.set(key, el);
        this.nodesEl.append(el);
      }
      update?.(el);
      const tx = x;
      const ty = y;
      if (isNew) {
        el.style.transition = 'none';
        el.style.transform = `translate(${tx}px, ${ty}px)`;
        el.classList.add('is-entering');
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-entering')));
      } else {
        el.style.transition = reduce ? 'none' : '';
        el.style.transform = `translate(${tx}px, ${ty}px)`;
      }
      el._x = tx;
      el._y = ty;
    };

    // Cartes
    for (const n of layout.nodes) {
      place(n.key, n.x - S.W / 2, n.y - S.H / 2, () => {
        const el = document.createElement('article');
        el.className = 'card';
        el.tabIndex = 0;
        return el;
      }, (el) => this.fillCard(el, n));
    }
    // Emplacements fantômes « ajouter »
    for (const g of layout.ghosts) {
      place(g.key, g.x - S.W / 2, g.y - S.H / 2, () => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'card card--ghost';
        return el;
      }, (el) => {
        el.dataset.add = g.action;
        el.dataset.pid = g.of;
        el.innerHTML = `<span class="ghost__plus">${icon('plus', 'size-5')}</span><span>${esc(g.label)}</span>`;
      });
    }
    // Nœuds d'union
    for (const u of layout.unions) {
      const size = u.small ? 14 : 26;
      place(u.key, u.x - size / 2, u.y - size / 2, () => {
        const el = document.createElement('button');
        el.type = 'button';
        return el;
      }, (el) => {
        el.className = `union-node ${u.small ? 'union-node--solo' : ''} union-node--${u.status}`;
        el.dataset.union = u.unionId;
        el.style.setProperty('--uc', u.color);
        el.innerHTML = u.small ? '' : u.index ? `<span>${u.index}</span>` : icon(u.type === 'mariage' || u.type === 'religieux' || u.type === 'coutumier' ? 'rings' : 'heart', 'size-3.5');
        el.setAttribute('aria-label', unionLabel(u.unionId));
        el.dataset.tip = u.small ? 'Parent seul ou autre parent inconnu' : unionLabel(u.unionId);
      });
    }

    // Suppression des éléments disparus
    for (const [key, el] of this.elements) {
      if (alive.has(key)) continue;
      this.elements.delete(key);
      if (reduce) { el.remove(); continue; }
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 380);
    }

    this.drawLinks(layout, reduce ? 0 : previous ? 320 : 120);
    this.markSelection();

    if (recenter || !previous) {
      // Zoom de départ adapté à la largeur de l'écran (téléphone ≈ 0,6)
      const startK = Math.min(1, Math.max(0.5, this.viewSize().w / 1000 + 0.22));
      this.centerOn(0, 0, previous ? this.cam.k : startK, reduce ? 0 : 650);
    } else if (shift.x || shift.y) {
      this.centerOn(0, 0, this.cam.k, reduce ? 0 : 750);
    } else {
      this.drawMinimap();
    }
  }

  fillCard(el, n) {
    const p = store.person(n.pid);
    if (!p) return;
    const perms = store.perms;
    const dead = !p.is_living;
    const a = age(p);
    const life = lifespan(p);
    const ageTxt = a !== null ? (dead ? `à ${a} ans` : `${a} ans`) : '';
    el.className = [
      'card', `card--${n.role}`, dead ? 'is-dead' : 'is-alive', `g-${p.gender}`,
      n.pid === this.focusId && n.role === 'focus' ? 'is-focus' : '',
    ].join(' ');
    el.dataset.pid = p.id;
    el.style.setProperty('--h', hue(p.id));
    el.setAttribute('aria-label', `${fullName(p)}${life ? ', ' + life : ''}${dead ? ', décédé' + genderize(p, '', 'e') : ''}`);

    const badges = [];
    if (n.role === 'spouse' && store.hasParents(p.id)) badges.push(`<button class="chip chip--up" data-act="focus" data-tip="Voir la famille de ${esc(fullName(p))}">${icon('up', 'size-3')}</button>`);
    if (n.role === 'anc' && n.hiddenParents) badges.push(`<button class="chip chip--up" data-act="focus" data-tip="Remonter plus loin">${icon('up', 'size-3')}</button>`);
    if (n.role === 'anc' && n.otherUnions > 0) badges.push(`<button class="chip chip--side" data-act="focus" data-tip="${n.otherUnions} autre${n.otherUnions > 1 ? 's' : ''} union${n.otherUnions > 1 ? 's' : ''} — afficher">${icon('rings', 'size-3')}<b>+${n.otherUnions}</b></button>`);
    if (n.role === 'sibling' && (n.totalChildren || n.unionsCount)) badges.push(`<button class="chip chip--down" data-act="focus" data-tip="Afficher sa famille">${icon('users', 'size-3')}<b>${n.totalChildren}</b></button>`);
    if ((n.role === 'desc' || n.role === 'focus') && n.hiddenChildren > 0) {
      badges.push(`<button class="chip chip--down" data-act="${n.collapsed ? 'expand' : 'focus'}" data-tip="${n.hiddenChildren} enfant${n.hiddenChildren > 1 ? 's' : ''} masqué${n.hiddenChildren > 1 ? 's' : ''} — afficher">${icon('down', 'size-3')}<b>${n.hiddenChildren}</b></button>`);
    } else if ((n.role === 'desc' || n.role === 'focus') && n.canCollapse) {
      badges.push(`<button class="chip chip--down chip--fold" data-act="collapse" data-tip="Replier la descendance">${icon('up', 'size-3')}</button>`);
    }

    const adds = perms.add ? `
      <button class="card__add card__add--top" data-add="parent" data-tip="Ajouter un parent">${icon('plus', 'size-3.5')}</button>
      <button class="card__add card__add--right" data-add="spouse" data-tip="Ajouter un conjoint / une union">${icon('heart', 'size-3.5')}</button>
      <button class="card__add card__add--bottom" data-add="child" data-tip="Ajouter un enfant">${icon('plus', 'size-3.5')}</button>
      <button class="card__add card__add--left" data-add="sibling" data-tip="Ajouter un frère ou une sœur">${icon('users', 'size-3.5')}</button>` : '';

    const name = p.nickname && this.options.compact ? p.nickname : [p.first_names?.split(/\s+/)[0], p.last_name, this.options.compact ? '' : p.postnom].filter(Boolean).join(' ');
    el.innerHTML = `
      <div class="card__glow"></div>
      <div class="card__body">
        <div class="card__avatar">${avatarHtml(p)}${dead ? '<span class="card__cross" aria-hidden="true">†</span>' : '<span class="card__alive" aria-hidden="true"></span>'}</div>
        <div class="card__text">
          <h3 class="card__name" title="${esc(fullName(p))}">${esc(name || 'Sans nom')}</h3>
          <p class="card__meta"><span>${esc(life)}</span>${ageTxt ? `<span class="card__age">${esc(ageTxt)}</span>` : ''}</p>
          ${p.birth_name && p.birth_name !== p.last_name && !this.options.compact ? `<p class="card__birthname">${genderize(p, 'né', 'née', 'né(e)')} ${esc(p.birth_name)}</p>` : ''}
          ${p.occupation && !this.options.compact ? `<p class="card__job">${esc(p.occupation)}</p>` : ''}
        </div>
      </div>
      <div class="card__badges">${badges.join('')}</div>
      ${adds}`;
  }

  drawLinks(layout, delay) {
    const svg = this.linksEl;
    const old = [...svg.children];
    old.forEach((p) => p.classList.add('is-leaving'));
    setTimeout(() => old.forEach((p) => p.remove()), delay ? 260 : 0);

    const frag = document.createDocumentFragment();
    const NS = 'http://www.w3.org/2000/svg';
    for (const l of layout.links) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `link ${l.cls || ''} ${l.child ? 'link--child' : 'link--couple'}`);
      g.style.setProperty('--lc', l.color);
      const halo = document.createElementNS(NS, 'path');
      halo.setAttribute('d', l.d);
      halo.setAttribute('class', 'link__halo');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', l.d);
      path.setAttribute('class', 'link__line');
      g.append(halo, path);
      if (delay) {
        // Trait plein : il se dessine ; pointillés : simple fondu
        const solid = !l.cls;
        if (solid) path.setAttribute('pathLength', '1');
        g.classList.add(solid ? 'is-drawing' : 'is-fading');
        g.style.setProperty('--delay', `${delay}ms`);
        if (solid) setTimeout(() => { path.removeAttribute('pathLength'); g.classList.remove('is-drawing'); }, delay + 1000);
      }
      frag.append(g);
    }
    svg.append(frag);
  }

  markSelection() {
    for (const el of this.elements.values()) {
      el.classList.toggle('is-selected', el.dataset.pid && Number(el.dataset.pid) === this.selectedId && el.classList.contains('card') && !el.classList.contains('card--ghost'));
    }
  }

  select(pid) {
    this.selectedId = pid;
    this.markSelection();
  }

  /** Position (monde) de la première carte d'une personne */
  positionOf(pid) {
    return this.layout?.nodes.find((n) => n.pid === pid) ?? null;
  }

  // ---------------------------------------------------------------
  //  Caméra
  // ---------------------------------------------------------------
  applyCamera() {
    const { x, y, k } = this.cam;
    this.world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    this.world.style.setProperty('--zoom', k);
    this.viewport.classList.toggle('is-far', k < 0.45);
    this.onCamera?.(this.cam);
    this.scheduleMinimap();
  }

  viewSize() {
    const r = this.viewport.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }

  /** Zone réellement visible (sans le panneau de fiche ouvert sur la droite) */
  visibleWidth() {
    const { w } = this.viewSize();
    const panel = document.getElementById('panel');
    if (document.body.classList.contains('panel-open') && panel && w > 900) return w - panel.offsetWidth;
    return w;
  }

  animateTo(target, duration = 600) {
    cancelAnimationFrame(this.anim);
    if (!duration) {
      Object.assign(this.cam, target);
      this.applyCamera();
      return;
    }
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = ease(t);
      this.cam.x = from.x + (target.x - from.x) * e;
      this.cam.y = from.y + (target.y - from.y) * e;
      this.cam.k = from.k + (target.k - from.k) * e;
      this.applyCamera();
      if (t < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  centerOn(wx, wy, k = this.cam.k, duration = 600) {
    const { h } = this.viewSize();
    const w = this.visibleWidth();
    // Légèrement au-dessus du centre pour laisser respirer la descendance
    this.animateTo({ x: w / 2 - wx * k, y: h * 0.46 - wy * k, k }, duration);
  }

  centerOnPerson(pid, duration = 600) {
    const n = this.positionOf(pid);
    if (n) this.centerOn(n.x, n.y, Math.max(this.cam.k, 0.7), duration);
  }

  fit(duration = 700) {
    const b = this.layout?.bounds;
    if (!b) return;
    const { w, h } = this.viewSize();
    const pad = 120;
    const k = Math.max(MIN_K, Math.min(1.1, (w - pad) / (b.maxX - b.minX), (h - pad - 60) / (b.maxY - b.minY)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.animateTo({ x: w / 2 - cx * k, y: h / 2 + 20 - cy * k, k }, duration);
  }

  zoomBy(factor, cx, cy, duration = 0) {
    const { w, h } = this.viewSize();
    cx ??= w / 2;
    cy ??= h / 2;
    const k = Math.max(MIN_K, Math.min(MAX_K, this.cam.k * factor));
    const f = k / this.cam.k;
    const target = { x: cx - (cx - this.cam.x) * f, y: cy - (cy - this.cam.y) * f, k };
    if (duration) this.animateTo(target, duration);
    else {
      cancelAnimationFrame(this.anim);
      Object.assign(this.cam, target);
      this.applyCamera();
    }
  }

  panBy(dx, dy) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.applyCamera();
  }

  bindPointer() {
    const vp = this.viewport;
    const pointers = new Map();
    let last = null;
    let pinch = null;
    let moved = 0;
    let velocity = { x: 0, y: 0, t: 0 };
    let inertia = null;

    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.card__add, .chip, .union-node, button')) return;
      cancelAnimationFrame(this.anim);
      cancelAnimationFrame(inertia);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k };
      }
    });

    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const { left, top } = this.viewSize();
        const cx = (a.x + b.x) / 2 - left;
        const cy = (a.y + b.y) / 2 - top;
        this.zoomBy((pinch.k * (d / pinch.d)) / this.cam.k, cx, cy);
        moved += 10;
        return;
      }
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4 && !vp.classList.contains('is-dragging')) {
        vp.classList.add('is-dragging');
        // Capture seulement une fois le glissement engagé : les clics simples restent sur les cartes
        try { vp.setPointerCapture(e.pointerId); } catch { /* */ }
      }
      const now = performance.now();
      const dt = Math.max(1, now - last.t);
      velocity = { x: (dx / dt) * 16, y: (dy / dt) * 16, t: now };
      last = { x: e.clientX, y: e.clientY, t: now };
      this.panBy(dx, dy);
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        vp.classList.remove('is-dragging');
        if (moved > 4) {
          this._suppressClick = true;
          setTimeout(() => (this._suppressClick = false), 0);
        }
        // Inertie
        if (performance.now() - velocity.t < 80 && !prefersReducedMotion()) {
          let { x: vx, y: vy } = velocity;
          const step = () => {
            vx *= 0.92;
            vy *= 0.92;
            this.panBy(vx, vy);
            if (Math.abs(vx) + Math.abs(vy) > 0.4) inertia = requestAnimationFrame(step);
          };
          inertia = requestAnimationFrame(step);
        }
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      cancelAnimationFrame(inertia);
      const { left, top } = this.viewSize();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        // Pavé tactile : deux doigts = déplacement, pincement (ctrlKey) = zoom
        const isTrackpadPan = !e.ctrlKey && Math.abs(e.deltaX) > 0 && e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && Math.abs(e.deltaX) > 0.5;
        if (isTrackpadPan) {
          this.panBy(-e.deltaX, -e.deltaY);
          return;
        }
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016) * (e.deltaMode === 1 ? 16 : 1));
        this.zoomBy(factor, e.clientX - left, e.clientY - top);
      } else {
        this.panBy(-e.deltaY, 0);
      }
    }, { passive: false });
  }

  bindNodes() {
    this.nodesEl.addEventListener('click', (e) => {
      if (this._suppressClick) return;
      const add = e.target.closest('[data-add]');
      if (add) {
        e.stopPropagation();
        const pid = Number(add.dataset.pid || add.closest('.card')?.dataset.pid);
        this.onAdd?.(add.dataset.add, pid);
        return;
      }
      const chip = e.target.closest('[data-act]');
      const card = e.target.closest('.card');
      if (chip && card) {
        e.stopPropagation();
        const pid = Number(card.dataset.pid);
        const act = chip.dataset.act;
        if (act === 'collapse') { this.options.collapsed.add(pid); this.saveCollapsed(); this.render(); }
        else if (act === 'expand') { this.options.collapsed.delete(pid); this.saveCollapsed(); this.render(); }
        else this.onFocus?.(pid);
        return;
      }
      const un = e.target.closest('.union-node');
      if (un) {
        this.onUnion?.(Number(un.dataset.union), un);
        return;
      }
      if (card && !card.classList.contains('card--ghost')) this.onSelect?.(Number(card.dataset.pid));
    });
    this.nodesEl.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.card');
      if (card && !card.classList.contains('card--ghost') && !e.target.closest('button')) this.onFocus?.(Number(card.dataset.pid));
    });
    this.nodesEl.addEventListener('keydown', (e) => {
      const card = e.target.closest('.card');
      if (!card || e.target !== card) return;
      if (e.key === 'Enter') this.onSelect?.(Number(card.dataset.pid));
      if (e.key === ' ') { e.preventDefault(); this.onFocus?.(Number(card.dataset.pid)); }
    });
  }

  saveCollapsed() {
    try { localStorage.setItem('arbre-collapsed', JSON.stringify([...this.options.collapsed])); } catch { /* */ }
  }

  // ---------------------------------------------------------------
  //  Mini-carte
  // ---------------------------------------------------------------
  scheduleMinimap() {
    if (this._mm) return;
    this._mm = requestAnimationFrame(() => { this._mm = null; this.drawMinimap(); });
  }

  minimapTransform() {
    const b = this.layout?.bounds;
    const c = this.minimap;
    if (!b || !c) return null;
    const pad = 10;
    const W = c.clientWidth || 200;
    const H = c.clientHeight || 130;
    const s = Math.min((W - pad * 2) / (b.maxX - b.minX || 1), (H - pad * 2) / (b.maxY - b.minY || 1));
    const ox = (W - (b.maxX - b.minX) * s) / 2 - b.minX * s;
    const oy = (H - (b.maxY - b.minY) * s) / 2 - b.minY * s;
    return { s, ox, oy, W, H };
  }

  drawMinimap() {
    const c = this.minimap;
    const t = this.minimapTransform();
    if (!c || !t) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== t.W * dpr) { c.width = t.W * dpr; c.height = t.H * dpr; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, t.W, t.H);
    const css = getComputedStyle(document.documentElement);
    const alive = css.getPropertyValue('--mm-alive').trim() || '#7dd3fc';
    const dead = css.getPropertyValue('--mm-dead').trim() || '#94a3b8';
    const focus = css.getPropertyValue('--mm-focus').trim() || '#fbbf24';
    const { S } = this.layout;
    for (const n of this.layout.nodes) {
      const p = store.person(n.pid);
      ctx.fillStyle = n.role === 'focus' ? focus : p?.is_living ? alive : dead;
      const w = Math.max(3, S.W * t.s);
      const h = Math.max(2, S.H * t.s);
      ctx.beginPath();
      ctx.roundRect?.(n.x * t.s + t.ox - w / 2, n.y * t.s + t.oy - h / 2, w, h, 1.5) ?? ctx.rect(n.x * t.s + t.ox - w / 2, n.y * t.s + t.oy - h / 2, w, h);
      ctx.fill();
    }
    // Rectangle de la vue
    const { w, h } = this.viewSize();
    const vx = (-this.cam.x / this.cam.k) * t.s + t.ox;
    const vy = (-this.cam.y / this.cam.k) * t.s + t.oy;
    const vw = (w / this.cam.k) * t.s;
    const vh = (h / this.cam.k) * t.s;
    ctx.strokeStyle = focus;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect?.(vx, vy, vw, vh, 4) ?? ctx.rect(vx, vy, vw, vh);
    ctx.fill();
    ctx.stroke();
  }

  bindMinimap() {
    const c = this.minimap;
    if (!c) return;
    let down = false;
    const go = (e, duration) => {
      const t = this.minimapTransform();
      if (!t) return;
      const r = c.getBoundingClientRect();
      const wx = (e.clientX - r.left - t.ox) / t.s;
      const wy = (e.clientY - r.top - t.oy) / t.s;
      const { w, h } = this.viewSize();
      this.animateTo({ x: w / 2 - wx * this.cam.k, y: h / 2 - wy * this.cam.k, k: this.cam.k }, duration);
    };
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); go(e, 300); });
    c.addEventListener('pointermove', (e) => down && go(e, 0));
    c.addEventListener('pointerup', () => (down = false));
  }
}

export function unionLabel(unionId) {
  const u = store.union(unionId);
  if (!u) return '';
  const names = u.partners.map((id) => store.person(id)?.first_names?.split(/\s+/)[0]).filter(Boolean).join(' & ');
  const parts = [UNION_TYPES[u.type] || 'Union'];
  if (u.start_date) parts.push(`${u.start_approx ? '' : 'le '}${formatDate(u.start_date, u.start_approx)}`);
  if (u.start_place) parts.push(`à ${u.start_place}`);
  let s = `${names} — ${parts.join(' ')}`;
  if (u.status !== 'en_cours') s += ` · ${UNION_STATUSES[u.status]}${u.end_date ? ' (' + formatDate(u.end_date, u.end_approx) + ')' : ''}`;
  return s;
}
