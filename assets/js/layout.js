// =====================================================================
//  Calcul de la disposition de l'arbre en « sablier » autour d'une
//  personne : ascendants au-dessus, descendants en dessous, conjoints
//  de part et d'autre (unions numérotées), frères et sœurs sur la ligne.
// =====================================================================
import { store } from './store.js';
import { UNION_COLORS } from './core.js';

export const SIZES = {
  normal:  { W: 228, H: 112, COUPLE: 70, GAP: 34, VGAP: 124 },
  compact: { W: 172, H: 66,  COUPLE: 56, GAP: 24, VGAP: 100 },
};

/**
 * @param {number} focusId
 * @param {{up:number, down:number, siblings:boolean, compact:boolean, collapsed:Set<number>, canAdd:boolean}} opt
 */
export function computeLayout(focusId, opt) {
  const S = opt.compact ? SIZES.compact : SIZES.normal;
  const ROW = S.H + S.VGAP;
  const SLOT = S.W + S.COUPLE;
  const out = { nodes: [], unions: [], links: [], ghosts: [], S, ROW };
  const seen = new Map(); // pid → nb d'apparitions (pour clés uniques)

  const keyFor = (pid) => {
    const n = seen.get(pid) ?? 0;
    seen.set(pid, n + 1);
    return n === 0 ? `p${pid}` : `p${pid}_${n}`;
  };

  // ---------------------------------------------------------------
  //  1. Mesure récursive des descendants
  // ---------------------------------------------------------------
  function measureDesc(pid, depth, chain) {
    const unions = store.personUnions(pid);
    const couples = unions.filter((u) => u.partners.length === 2);
    const solos = unions.filter((u) => u.partners.length === 1);

    // Emplacements des conjoints
    const slots = []; // {union, spouse, sx, nx, arc}
    if (couples.length >= 2) {
      slots.push({ union: couples[0], spouse: store.partnerIn(couples[0], pid), sx: -SLOT, nx: -SLOT / 2, arc: 0, idx: 1 });
      couples.slice(1).forEach((u, k) => {
        slots.push({ union: u, spouse: store.partnerIn(u, pid), sx: (k + 1) * SLOT, nx: (k + 0.5) * SLOT, arc: k, idx: k + 2 });
      });
    } else if (couples.length === 1) {
      slots.push({ union: couples[0], spouse: store.partnerIn(couples[0], pid), sx: SLOT, nx: SLOT / 2, arc: 0, idx: 0 });
    }
    const hasLeft = couples.length >= 2;
    const nRight = couples.length >= 2 ? couples.length - 1 : couples.length;
    const rowL = S.W / 2 + (hasLeft ? SLOT : 0);
    const rowR = S.W / 2 + nRight * SLOT;

    // Groupes d'enfants, dans l'ordre visuel gauche → droite
    const ordered = [];
    if (hasLeft) ordered.push({ union: slots[0].union, nx: slots[0].nx, solo: false });
    for (const u of solos) ordered.push({ union: u, nx: 0, solo: true });
    for (const s of slots.slice(hasLeft ? 1 : 0)) ordered.push({ union: s.union, nx: s.nx, solo: false });

    const totalChildren = unions.reduce((n, u) => n + u.children.length, 0);
    const collapsed = opt.collapsed.has(pid);
    const showKids = depth > 0 && !collapsed;
    const groups = [];

    if (showKids) {
      let prevRight = -Infinity;
      for (const g of ordered) {
        const kids = store.unionChildren(g.union).filter((c) => !chain.has(c.id));
        if (!kids.length) continue;
        const blocks = kids.map((c) => ({ c, b: measureDesc(c.id, depth - 1, new Set(chain).add(c.id)) }));
        const xs = [0];
        for (let i = 1; i < blocks.length; i++) xs.push(xs[i - 1] + blocks[i - 1].b.R + S.GAP + blocks[i].b.L);
        const a = -blocks[0].b.L;
        const b = xs[xs.length - 1] + blocks[blocks.length - 1].b.R;
        const mid = xs[xs.length - 1] / 2;
        const desired = g.nx - mid;
        const shift = Math.max(desired, prevRight + S.GAP * 1.4 - a);
        prevRight = b + shift;
        groups.push({ ...g, blocks, xs: xs.map((x) => x + shift), dev: shift - desired, a: a + shift, b: b + shift });
      }
      if (groups.length) {
        const devs = groups.map((g) => g.dev);
        const corr = -(Math.min(...devs) + Math.max(...devs)) / 2;
        for (const g of groups) {
          g.xs = g.xs.map((x) => x + corr);
          g.a += corr;
          g.b += corr;
        }
      }
    }

    let L = rowL;
    let R = rowR;
    for (const g of groups) {
      L = Math.max(L, -g.a);
      R = Math.max(R, g.b);
    }
    const shown = groups.reduce((n, g) => n + g.blocks.length, 0);
    return { pid, slots, groups, L, R, rowL, rowR, hidden: totalChildren - shown, collapsed, totalChildren };
  }

  // ---------------------------------------------------------------
  //  2. Placement des descendants
  // ---------------------------------------------------------------
  function placeDesc(m, x, gen, role) {
    const y = gen * ROW;
    const multi = store.coupleUnions(m.pid).length >= 2;
    out.nodes.push(node(m.pid, x, y, role, gen, {
      hiddenChildren: m.hidden, collapsed: m.collapsed, canCollapse: m.totalChildren > 0 && m.hidden < m.totalChildren,
      totalChildren: m.totalChildren,
    }));

    // Conjoints et nœuds d'union
    for (const s of m.slots) {
      const sx = x + s.sx;
      const nx = x + s.nx;
      const color = multi ? UNION_COLORS[(s.idx - 1) % UNION_COLORS.length] : UNION_COLORS[0];
      if (s.spouse) out.nodes.push(node(s.spouse, sx, y, 'spouse', gen, { hasHiddenParents: store.hasParents(s.spouse) }));
      out.unions.push({ key: `u${s.union.id}_${m.pid}`, unionId: s.union.id, x: nx, y, color, index: multi ? s.idx : 0, status: s.union.status, type: s.union.type });

      const cls = linkClass(s.union.status);
      const edge = S.W / 2;
      if (s.sx < 0) {
        out.links.push({ d: `M${x - edge},${y} H${sx + edge}`, color, cls });
      } else if (s.arc === 0) {
        out.links.push({ d: `M${x + edge},${y} H${sx - edge}`, color, cls });
      } else {
        // Remariage non adjacent : arc au-dessus des cartes
        const top = y - S.H / 2;
        const ay = top - 16 - 9 * (s.arc - 1);
        const x0 = x + S.W * 0.28 + 8 * (s.arc - 1);
        const r = 10;
        out.links.push({
          d: `M${x0},${top} V${ay + r} Q${x0},${ay} ${x0 + r},${ay} H${nx - r} Q${nx},${ay} ${nx},${ay + r} V${y}`,
          color, cls,
        });
        out.links.push({ d: `M${nx},${y} H${sx - edge}`, color, cls });
      }
    }

    // Enfants
    m.groups.forEach((g, gi) => {
      const multiColor = multi && !g.solo;
      const slot = m.slots.find((s) => s.union.id === g.union.id);
      const color = multiColor && slot ? UNION_COLORS[(slot.idx - 1) % UNION_COLORS.length] : UNION_COLORS[0];
      const nx = x + g.nx;
      const ny = g.solo ? y + S.H / 2 : y;
      if (g.solo) out.unions.push({ key: `u${g.union.id}_${m.pid}`, unionId: g.union.id, x: nx, y: y + S.H / 2 + 12, color, index: 0, status: 'solo', type: 'solo', small: true });
      const busY = y + S.H / 2 + S.VGAP / 2 + (gi - (m.groups.length - 1) / 2) * 8;
      const childTop = (gen + 1) * ROW - S.H / 2;
      g.blocks.forEach(({ c, b }, i) => {
        const cx = x + g.xs[i];
        out.links.push({ d: elbow(nx, g.solo ? y + S.H / 2 + 24 : ny, cx, busY, childTop), color, cls: c.relation === 'biologique' ? '' : 'is-adopt', child: true });
        placeDesc(b, cx, gen + 1, 'desc');
      });
    });
  }

  // ---------------------------------------------------------------
  //  3. Ascendants
  // ---------------------------------------------------------------
  function measureAnc(pid, depth, chain) {
    const pu = depth > 0 ? store.parentUnion(pid) : null;
    if (!pu) return { pid, L: S.W / 2, R: S.W / 2, parents: [] };
    const ps = store.orderedParents(pu.union).filter((p) => !chain.has(p));
    if (!ps.length) return { pid, L: S.W / 2, R: S.W / 2, parents: [] };
    const subs = ps.map((p) => measureAnc(p, depth - 1, new Set(chain).add(p)));
    if (subs.length === 1) {
      return { pid, union: pu.union, relation: pu.relation, parents: [{ m: subs[0], dx: 0 }], L: Math.max(S.W / 2, subs[0].L), R: Math.max(S.W / 2, subs[0].R) };
    }
    const d = Math.max(SLOT, subs[0].R + S.GAP + subs[1].L);
    return {
      pid, union: pu.union, relation: pu.relation,
      parents: [{ m: subs[0], dx: -d / 2 }, { m: subs[1], dx: d / 2 }],
      L: Math.max(S.W / 2, d / 2 + subs[0].L), R: Math.max(S.W / 2, d / 2 + subs[1].R),
    };
  }

  function placeAncParents(m, x, gen, extraChildren = []) {
    if (!m.parents.length) return;
    const y = -gen * ROW;
    const childTop = -(gen - 1) * ROW - S.H / 2;
    const multiColor = UNION_COLORS[0];
    const cls = linkClass(m.union.status);
    for (const { m: pm, dx } of m.parents) {
      const unionCount = store.coupleUnions(pm.pid).length;
      out.nodes.push(node(pm.pid, x + dx, y, 'anc', -gen, {
        otherUnions: Math.max(0, unionCount - (m.parents.length === 2 ? 1 : 0)),
        hiddenParents: !pm.parents.length && store.hasParents(pm.pid),
      }));
      placeAncParents(pm, x + dx, gen + 1);
    }
    const adopt = m.relation !== 'biologique' ? 'is-adopt' : '';
    if (m.parents.length === 2) {
      const [a, b] = m.parents;
      out.links.push({ d: `M${x + a.dx + S.W / 2},${y} H${x + b.dx - S.W / 2}`, color: multiColor, cls });
      out.unions.push({ key: `u${m.union.id}_a${m.pid}`, unionId: m.union.id, x, y, color: multiColor, index: 0, status: m.union.status, type: m.union.type });
      const busY = y + S.H / 2 + S.VGAP / 2;
      out.links.push({ d: elbow(x, y, x, busY, childTop), color: multiColor, cls: adopt, child: true });
      for (const c of extraChildren) out.links.push({ d: elbow(x, y, c.x, busY, childTop), color: multiColor, cls: c.relation !== 'biologique' ? 'is-adopt' : '', child: true });
    } else {
      const py = y + S.H / 2;
      out.unions.push({ key: `u${m.union.id}_a${m.pid}`, unionId: m.union.id, x, y: py + 12, color: multiColor, index: 0, status: 'solo', type: 'solo', small: true });
      const busY = y + S.H / 2 + S.VGAP / 2;
      out.links.push({ d: elbow(x, py + 24, x, busY, childTop), color: multiColor, cls: adopt, child: true });
      for (const c of extraChildren) out.links.push({ d: elbow(x, py + 24, c.x, busY, childTop), color: multiColor, cls: c.relation !== 'biologique' ? 'is-adopt' : '', child: true });
      if (gen === 1 && opt.canAdd) {
        out.ghosts.push({ key: 'g-other-parent', x: x + SLOT, y, label: 'Ajouter l\'autre parent', action: 'parent', of: m.pid });
      }
    }
  }

  // ---------------------------------------------------------------
  //  Assemblage
  // ---------------------------------------------------------------
  const desc = measureDesc(focusId, opt.down, new Set([focusId]));
  const anc = measureAnc(focusId, opt.up, new Set([focusId]));

  // Frères et sœurs (ligne du centre)
  const siblingsOut = [];
  if (opt.siblings && anc.union) {
    const all = store.unionChildren(anc.union);
    const idx = all.findIndex((c) => c.id === focusId);
    const before = all.slice(0, Math.max(0, idx)).reverse();
    const after = all.slice(idx + 1);
    const stepW = S.W + S.GAP;
    before.forEach((c, i) => siblingsOut.push({ ...c, x: -desc.rowL - S.GAP - S.W / 2 - i * stepW }));
    after.forEach((c, i) => siblingsOut.push({ ...c, x: desc.rowR + S.GAP + S.W / 2 + i * stepW }));
  }

  placeDesc(desc, 0, 0, 'focus');
  for (const s of siblingsOut) {
    out.nodes.push(node(s.id, s.x, 0, 'sibling', 0, { totalChildren: store.children(s.id).length, unionsCount: store.coupleUnions(s.id).length }));
  }
  placeAncParents(anc, 0, 1, siblingsOut);

  if (opt.up > 0 && !anc.parents.length && opt.canAdd) {
    out.ghosts.push({ key: 'g-parent', x: 0, y: -ROW, label: 'Ajouter un parent', action: 'parent', of: focusId });
  }

  // Boîte englobante
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of [...out.nodes, ...out.ghosts]) {
    minX = Math.min(minX, n.x - S.W / 2);
    maxX = Math.max(maxX, n.x + S.W / 2);
    minY = Math.min(minY, n.y - S.H / 2);
    maxY = Math.max(maxY, n.y + S.H / 2);
  }
  out.bounds = { minX, maxX, minY, maxY };
  return out;

  // ---------------------------------------------------------------
  function node(pid, x, y, role, gen, extra = {}) {
    return { key: keyFor(pid), pid, x, y, role, gen, ...extra };
  }
}

function linkClass(status) {
  if (status === 'divorce' || status === 'separe' || status === 'annule') return 'is-broken';
  if (status === 'veuvage') return 'is-ended';
  return '';
}

/** Lien coudé arrondi : départ (x1,y1) → bus horizontal à busY → enfant (x2, y2) */
function elbow(x1, y1, x2, busY, y2) {
  const dx = x2 - x1;
  if (Math.abs(dx) < 1) return `M${x1},${y1} V${y2}`;
  const r = Math.min(14, Math.abs(dx) / 2, Math.abs(busY - y1) - 1);
  const s = Math.sign(dx);
  return `M${x1},${y1} V${busY - r} Q${x1},${busY} ${x1 + s * r},${busY} H${x2 - s * r} Q${x2},${busY} ${x2},${busY + r} V${y2}`;
}
