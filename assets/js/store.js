// =====================================================================
//  Données de l'arbre en mémoire + relations dérivées
// =====================================================================
import { api, year } from './core.js';

const listeners = new Set();

export const store = {
  persons: new Map(),      // id → personne
  unions: new Map(),       // id → union { partners:[], children:[{id, relation}] }
  unionsOf: new Map(),     // personne → [unionId] (en tant que partenaire)
  parentUnionsOf: new Map(), // personne → [{unionId, relation}]
  settings: {},
  me: null,

  get perms() { return this.me?.perms ?? {}; },

  async load() {
    const data = await api('tree');
    this.persons = new Map(data.persons.map((p) => [p.id, p]));
    this.unions = new Map(data.unions.map((u) => [u.id, u]));
    this.settings = data.settings;
    this.me = data.me;
    this.index();
    listeners.forEach((fn) => fn());
    return this;
  },

  index() {
    this.unionsOf = new Map();
    this.parentUnionsOf = new Map();
    for (const u of this.unions.values()) {
      for (const pid of u.partners) push(this.unionsOf, pid, u.id);
      for (const c of u.children) push(this.parentUnionsOf, c.id, { unionId: u.id, relation: c.relation });
    }
    // Unions triées par date (puis par id) pour numéroter les remariages
    for (const [pid, list] of this.unionsOf) {
      list.sort((a, b) => unionSortKey(this.unions.get(a)) - unionSortKey(this.unions.get(b)) || a - b);
    }
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  person(id) { return this.persons.get(Number(id)) ?? null; },
  union(id) { return this.unions.get(Number(id)) ?? null; },

  /** Unions d'une personne, dans l'ordre chronologique */
  personUnions(pid) {
    return (this.unionsOf.get(pid) ?? []).map((id) => this.unions.get(id));
  },

  /** Unions « couple » (avec un partenaire) uniquement */
  coupleUnions(pid) {
    return this.personUnions(pid).filter((u) => u.partners.length === 2);
  },

  partnerIn(union, pid) {
    return union.partners.find((x) => x !== pid) ?? null;
  },

  /** Numéro de l'union pour la personne (1, 2, 3…) parmi ses unions de couple */
  unionIndex(pid, unionId) {
    return this.coupleUnions(pid).findIndex((u) => u.id === unionId) + 1;
  },

  /** Union des parents : biologique en priorité */
  parentUnion(pid) {
    const list = this.parentUnionsOf.get(pid) ?? [];
    const bio = list.find((x) => x.relation === 'biologique') ?? list[0];
    return bio ? { union: this.unions.get(bio.unionId), relation: bio.relation } : null;
  },

  allParentUnions(pid) {
    return (this.parentUnionsOf.get(pid) ?? []).map((x) => ({ union: this.unions.get(x.unionId), relation: x.relation }));
  },

  parents(pid) {
    const out = [];
    for (const { union, relation } of this.allParentUnions(pid)) {
      for (const p of union.partners) out.push({ id: p, relation, unionId: union.id });
    }
    return out;
  },

  /** Parents ordonnés (père à gauche, mère à droite) */
  orderedParents(union) {
    const ps = [...union.partners];
    if (ps.length === 2) {
      const [a, b] = ps.map((id) => this.person(id));
      if (a?.gender === 'F' && b?.gender === 'M') ps.reverse();
    }
    return ps;
  },

  children(pid) {
    const out = [];
    for (const u of this.personUnions(pid)) for (const c of u.children) out.push({ ...c, unionId: u.id });
    return out;
  },

  /** Enfants d'une union triés par date de naissance */
  unionChildren(union) {
    return [...union.children].sort((a, b) => birthKey(this.person(a.id)) - birthKey(this.person(b.id)));
  },

  /** Frères et sœurs (pleins ou demi) */
  siblings(pid) {
    const full = new Map();
    const parentUnionIds = new Set((this.parentUnionsOf.get(pid) ?? []).map((x) => x.unionId));
    for (const uid of parentUnionIds) {
      for (const c of this.unions.get(uid).children) if (c.id !== pid) full.set(c.id, { id: c.id, half: false, unionId: uid });
    }
    // Demi-frères/sœurs : autres unions de chaque parent
    for (const uid of parentUnionIds) {
      for (const parent of this.unions.get(uid).partners) {
        for (const ou of this.personUnions(parent)) {
          if (parentUnionIds.has(ou.id)) continue;
          for (const c of ou.children) if (c.id !== pid && !full.has(c.id)) full.set(c.id, { id: c.id, half: true, unionId: ou.id, via: parent });
        }
      }
    }
    return [...full.values()].sort((a, b) => birthKey(this.person(a.id)) - birthKey(this.person(b.id)));
  },

  hasParents(pid) { return (this.parentUnionsOf.get(pid) ?? []).length > 0; },
  hasChildren(pid) { return this.personUnions(pid).some((u) => u.children.length > 0); },

  /** Racine par défaut : réglage, sinon l'ancêtre le plus ancien */
  rootId() {
    const r = this.settings.root_person_id;
    if (r && this.persons.has(r)) return r;
    let best = null;
    for (const p of this.persons.values()) {
      if (!best || birthKey(p) < birthKey(best)) best = p;
    }
    return best?.id ?? null;
  },
};

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function unionSortKey(u) {
  return u?.start_date ? year(u.start_date) * 400 + (parseInt(u.start_date.slice(5, 7), 10) || 0) * 31 : 1e9;
}

export function birthKey(p) {
  if (!p?.birth_date) return 9e9 + (p?.id ?? 0);
  const [y, m, d] = p.birth_date.split('-').map(Number);
  return y * 10000 + (m || 0) * 100 + (d || 0);
}
