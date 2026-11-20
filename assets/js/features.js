// =====================================================================
//  Recherche rapide, lien de parenté, anniversaires, statistiques,
//  raccourcis clavier, mot de passe.
// =====================================================================
import { api, esc, icon, toast, fullName, firstName, avatarHtml, lifespan, genderize, parseDate, formatDate, age, year, MONTHS_SHORT, debounce, $, $$ } from './core.js';
import { store } from './store.js';
import { openModal } from './modal.js';
import { searchPersons, pickItem, field } from './forms.js';

// ---------------------------------------------------------------------
//  Palette de recherche (Ctrl+K)
// ---------------------------------------------------------------------
export function openSearch({ onPick, onCreate }) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="palette__input">${icon('search', 'size-5')}<input type="search" placeholder="Nom, prénom, surnom, nom de jeune fille…" autofocus autocomplete="off" aria-label="Rechercher"><kbd>Échap</kbd></div>
    <div class="palette__results" role="listbox"></div>`;
  const m = openModal({ title: 'Rechercher', body, size: 'md', className: 'modal--palette' });
  const input = $('input', body);
  const list = $('.palette__results', body);
  let items = [];
  let active = 0;

  const recent = () => {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('arbre-recent') || '[]'); } catch { /* */ }
    return ids.map((id) => store.person(id)).filter(Boolean).slice(0, 6).map((p) => ({ p }));
  };

  const draw = () => {
    const q = input.value.trim();
    items = q ? searchPersons(q, 12) : recent();
    const head = q ? '' : items.length ? '<p class="palette__label">Consultés récemment</p>' : '<p class="palette__label">Tapez un nom pour chercher parmi les ' + store.persons.size + ' membres.</p>';
    list.innerHTML = head + items.map((it, i) => `
      <button type="button" class="palette__item ${i === active ? 'is-active' : ''}" data-i="${i}" role="option">
        ${avatarHtml(it.p, 'size-10')}
        <span class="min-w-0 flex-1 text-left"><b class="block truncate">${highlight(fullName(it.p), q)}</b>
        <small class="text-ink-soft">${esc(lifespan(it.p) || '—')}${it.p.birth_place ? ' · ' + esc(it.p.birth_place) : ''}${it.p.occupation ? ' · ' + esc(it.p.occupation) : ''}</small></span>
        <span class="palette__go">${icon('right', 'size-4')}</span>
      </button>`).join('')
      + (q && !items.length ? `<p class="palette__label">Aucun membre ne correspond à « ${esc(q)} ».</p>` : '')
      + (q && store.perms.add && onCreate ? `<button type="button" class="palette__item palette__item--create" data-create>${icon('plus', 'size-5')}<span>Créer « ${esc(q)} » comme nouvelle personne</span></button>` : '');
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    m.close();
    onPick(it.p.id);
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    if (e.key === 'Enter') { e.preventDefault(); pick(active); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) pick(Number(b.dataset.i));
    if (e.target.closest('[data-create]')) {
      const q = input.value.trim().split(/\s+/);
      m.close();
      onCreate({ first_names: q.slice(0, -1).join(' ') || q[0], last_name: q.length > 1 ? q[q.length - 1] : '' });
    }
  });
  draw();
}

function highlight(text, q) {
  if (!q) return esc(text);
  let out = esc(text);
  for (const t of q.split(/\s+/).filter((x) => x.length > 1)) {
    out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
  }
  return out;
}

export function rememberRecent(id) {
  try {
    const ids = JSON.parse(localStorage.getItem('arbre-recent') || '[]').filter((x) => x !== id);
    ids.unshift(id);
    localStorage.setItem('arbre-recent', JSON.stringify(ids.slice(0, 12)));
  } catch { /* */ }
}

// ---------------------------------------------------------------------
//  Lien de parenté
// ---------------------------------------------------------------------
function ancestorsWithPath(id) {
  // BFS : ancêtre → { d, next } (next = enfant vers la personne de départ)
  const map = new Map([[id, { d: 0, next: null }]]);
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const par of store.parents(cur)) {
      if (!map.has(par.id)) {
        map.set(par.id, { d: map.get(cur).d + 1, next: cur });
        q.push(par.id);
      }
    }
  }
  return map;
}

const arriere = (n) => 'arrière-'.repeat(Math.max(0, n));
/** Élision : « le arrière-grand-père » → « l'arrière-grand-père » */
const elide = (s) => s.replace(/\b(le|la) (?=[aeéèêiîoôuyh])/gi, "l'");
/** « de Emma » → « d'Emma » */
const de = (name) => (/^[aeéèêiîoôuyhAEÉÈÊIÎOÔUYH]/.test(name) ? "d'" : 'de ') + name;
const ordinal = (n) => `${n}e`;

/** Calcule la relation de A vers B : « A est le … de B » */
export function kinship(aId, bId) {
  const A = store.person(aId);
  const B = store.person(bId);
  if (!A || !B) return null;
  if (aId === bId) return { label: 'la même personne', path: [aId] };

  const ancA = ancestorsWithPath(aId);
  const ancB = ancestorsWithPath(bId);
  let best = null;
  for (const [id, ia] of ancA) {
    const ib = ancB.get(id);
    if (ib && (!best || ia.d + ib.d < best.a + best.b)) best = { id, a: ia.d, b: ib.d };
  }

  if (best) {
    const { a, b } = best;
    const g = (m, f, u) => genderize(A, m, f, u);
    let label;
    if (a === 0) {
      label = b === 1 ? g('le père', 'la mère', 'le parent') : `${g('le ', 'la ', 'le ')}${arriere(b - 2)}${g('grand-père', 'grand-mère', 'grand-parent')}`;
    } else if (b === 0) {
      label = a === 1 ? g('le fils', 'la fille', "l'enfant") : `${g('le ', 'la ', "l'")}${arriere(a - 2)}${g('petit-fils', 'petite-fille', 'petit-enfant')}`;
    } else if (a === 1 && b === 1) {
      const pa = new Set(store.parents(aId).map((x) => x.id));
      const pb = store.parents(bId).map((x) => x.id);
      const shared = pb.filter((x) => pa.has(x)).length;
      const half = shared < Math.min(pa.size, pb.length) || shared === 1 && (pa.size === 2 || pb.length === 2);
      label = `${g('le ', 'la ', 'le ')}${half ? 'demi-' : ''}${g('frère', 'sœur', 'frère/sœur')}`;
    } else if (a === 1) {
      label = b === 2 ? g("l'oncle", 'la tante', "l'oncle/la tante") : `${g('le ', 'la ', 'le ')}${arriere(b - 3)}grand-${g('oncle', 'tante', 'oncle/tante')}`;
    } else if (b === 1) {
      label = a === 2 ? g('le neveu', 'la nièce', 'le neveu/la nièce') : `${g('le ', 'la ', 'le ')}${arriere(a - 3)}petit${g('-neveu', 'e-nièce', '-neveu')}`;
    } else if (a === b) {
      const n = a - 1;
      const c = g('cousin', 'cousine', 'cousin(e)');
      label = `${g('le ', 'la ', 'le ')}${c} ${n === 1 ? g('germain', 'germaine', 'germain(e)') : n === 2 ? 'issu' + g('', 'e', '(e)') + ' de germains' : `au ${ordinal(n)} degré`}`;
    } else if (a === 2 && b === 3) {
      label = `${g("l'oncle", 'la tante', "l'oncle")} à la mode de Bretagne`;
    } else if (a === 3 && b === 2) {
      label = `${g('le neveu', 'la nièce', 'le neveu')} à la mode de Bretagne`;
    } else {
      const n = Math.min(a, b) - 1;
      const diff = Math.abs(a - b);
      label = `${g('le cousin', 'la cousine', 'le cousin')} au ${ordinal(n)} degré (décalé de ${diff} génération${diff > 1 ? 's' : ''})`;
    }
    label = elide(label);
    // Chemin : A → … → ancêtre commun ← … ← B
    const pathA = chain(ancA, best.id).reverse();
    const pathB = chain(ancB, best.id);
    const path = [...pathA, ...pathB.slice(1)];
    return { label, blood: true, ancestor: best.id, a, b, path, degree: a + b };
  }

  // Alliance : chemin le plus court via parents / enfants / conjoints
  const affinity = inLaw(aId, bId);
  const path = shortestPath(aId, bId);
  if (affinity) return { label: affinity, blood: false, path };
  if (path) return { label: 'lié(e) par alliance', blood: false, path };
  return { label: null, path: null };
}

/** Chaîne de l'ancêtre jusqu'à la personne de départ, puis inversée */
function chain(anc, ancestorId) {
  // anc : ancêtre → {next: enfant vers départ}
  const list = [ancestorId];
  let cur = anc.get(ancestorId);
  while (cur && cur.next !== null) {
    list.push(cur.next);
    cur = anc.get(cur.next);
  }
  return list; // ancêtre … départ
}

function spousesOf(id, { exes = true } = {}) {
  return store.coupleUnions(id).filter((u) => exes || u.status === 'en_cours' || u.status === 'veuvage').map((u) => ({ id: store.partnerIn(u, id), status: u.status }));
}

function inLaw(aId, bId) {
  const A = store.person(aId);
  const g = (m, f, u) => genderize(A, m, f, u);
  const sp = spousesOf(bId);
  const s = sp.find((x) => x.id === aId);
  if (s) {
    const ex = s.status === 'divorce' || s.status === 'separe' || s.status === 'annule';
    return `${ex ? g("l'ex-", "l'ex-", "l'ex-") : g("l'", "l'", 'le ')}${g('époux', 'épouse', 'conjoint(e)')}`;
  }
  const parentsOf = (id) => store.parents(id).map((x) => x.id);
  // Parent du conjoint de B
  for (const x of sp) if (parentsOf(x.id).includes(aId)) return g('le beau-père', 'la belle-mère', 'le beau-parent');
  // Conjoint d'un parent de B (beau-parent)
  for (const p of parentsOf(bId)) if (spousesOf(p).some((x) => x.id === aId)) return `${g('le beau-père', 'la belle-mère', 'le beau-parent')} (${g('conjoint', 'conjointe', 'conjoint(e)')} de ${genderize(store.person(p), 'son père', 'sa mère', 'son parent')})`;
  // Conjoint d'un enfant de B
  for (const c of store.children(bId)) if (spousesOf(c.id).some((x) => x.id === aId)) return g('le gendre', 'la belle-fille', 'le gendre / la belle-fille');
  // Enfant du conjoint de B
  for (const x of sp) if (store.children(x.id).some((c) => c.id === aId) && !store.children(bId).some((c) => c.id === aId)) return g('le beau-fils', 'la belle-fille', "l'enfant du conjoint");
  // Frère/sœur du conjoint, ou conjoint d'un frère/sœur
  for (const x of sp) if (store.siblings(x.id).some((y) => y.id === aId)) return g('le beau-frère', 'la belle-sœur', 'le beau-frère / la belle-sœur');
  for (const y of store.siblings(bId)) if (spousesOf(y.id).some((x) => x.id === aId)) return g('le beau-frère', 'la belle-sœur', 'le beau-frère / la belle-sœur');
  return null;
}

function shortestPath(a, b) {
  const prev = new Map([[a, null]]);
  const q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    const next = [...store.parents(cur).map((x) => x.id), ...store.children(cur).map((x) => x.id), ...spousesOf(cur).map((x) => x.id)];
    for (const n of next) if (!prev.has(n)) { prev.set(n, cur); q.push(n); }
  }
  if (!prev.has(b)) return null;
  const path = [];
  for (let c = b; c !== null; c = prev.get(c)) path.unshift(c);
  return path;
}

export function openKinship({ from = null, onFocus }) {
  const body = document.createElement('div');
  const pickers = ['a', 'b'].map((k) => `
    <div class="kin-picker" data-picker="${k}">
      <label class="field"><span>${k === 'a' ? 'Première personne' : 'Deuxième personne'}</span>
        <input type="search" placeholder="Rechercher…" data-q="${k}" autocomplete="off"></label>
      <div class="kin-picker__chosen" data-chosen="${k}"></div>
      <div class="pick-list pick-list--float hidden" data-list="${k}"></div>
    </div>`).join(`<div class="kin-swap"><button type="button" class="icon-btn" data-swap aria-label="Inverser">${icon('link', 'size-5')}</button></div>`);
  body.innerHTML = `<div class="kin-grid">${pickers}</div><div class="kin-result" data-result></div>`;
  const m = openModal({ title: 'Lien de parenté', subtitle: 'Découvrez comment deux membres de la famille sont reliés', body, size: 'lg' });
  const chosen = { a: from, b: null };

  const showChosen = (k) => {
    const p = store.person(chosen[k]);
    $(`[data-chosen="${k}"]`, body).innerHTML = p ? `<div class="kin-chip">${avatarHtml(p, 'size-12')}<div class="min-w-0"><b class="block truncate">${esc(fullName(p))}</b><small>${esc(lifespan(p))}</small></div><button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-clear="${k}" aria-label="Changer">${icon('x', 'size-4')}</button></div>` : '';
    $(`[data-q="${k}"]`, body).closest('.field').classList.toggle('hidden', !!p);
  };
  const compute = () => {
    const out = $('[data-result]', body);
    if (!chosen.a || !chosen.b) { out.innerHTML = '<p class="text-center text-ink-soft text-sm py-6">Choisissez deux personnes.</p>'; return; }
    const A = store.person(chosen.a);
    const B = store.person(chosen.b);
    const r = kinship(chosen.a, chosen.b);
    if (!r?.label && !r?.path) {
      out.innerHTML = `<div class="kin-answer"><p>Aucun lien trouvé entre <b>${esc(firstName(A))}</b> et <b>${esc(firstName(B))}</b> dans l'arbre.</p></div>`;
      return;
    }
    const back = kinship(chosen.b, chosen.a);
    out.innerHTML = `
      <div class="kin-answer">
        <p class="kin-answer__main"><b>${esc(fullName(A))}</b> est <em>${esc(r.label)}</em> ${/^[aeéèêiîoôuyh]/i.test(fullName(B)) ? "d'" : 'de '}<b>${esc(fullName(B))}</b>.</p>
        ${back?.label ? `<p class="kin-answer__back">… et ${esc(firstName(B))} est ${esc(back.label)} ${esc(de(firstName(A)))}.</p>` : ''}
        ${r.blood && r.degree ? `<p class="kin-answer__meta">Parenté de sang · ${r.degree}<sup>e</sup> degré (droit civil)${r.ancestor && r.a && r.b ? ` · ancêtre commun le plus proche : <button type="button" class="link-btn" data-focus="${r.ancestor}">${esc(fullName(store.person(r.ancestor)))}</button>` : ''}</p>` : !r.blood ? '<p class="kin-answer__meta">Lien par alliance (mariage ou union)</p>' : ''}
      </div>
      ${r.path ? `<div class="kin-path">${r.path.map((id, i) => {
        const p = store.person(id);
        return `${i ? `<span class="kin-path__arrow">${icon('right', 'size-4')}</span>` : ''}<button type="button" class="kin-path__p ${id === r.ancestor ? 'is-ancestor' : ''}" data-focus="${id}">${avatarHtml(p, 'size-10')}<small>${esc(firstName(p))}</small></button>`;
      }).join('')}</div>` : ''}`;
  };
  const refresh = () => { showChosen('a'); showChosen('b'); compute(); };

  for (const k of ['a', 'b']) {
    const input = $(`[data-q="${k}"]`, body);
    const list = $(`[data-list="${k}"]`, body);
    input.addEventListener('input', debounce(() => {
      const res = searchPersons(input.value, 6);
      list.classList.toggle('hidden', !res.length);
      list.innerHTML = res.map((x) => pickItem(x)).join('');
    }, 100));
    list.addEventListener('click', (e) => {
      const it = e.target.closest('[data-pick]');
      if (!it) return;
      chosen[k] = Number(it.dataset.pick);
      list.classList.add('hidden');
      input.value = '';
      refresh();
      if (!chosen[k === 'a' ? 'b' : 'a']) setTimeout(() => $(`[data-q="${k === 'a' ? 'b' : 'a'}"]`, body).focus(), 50);
    });
  }
  body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-clear]');
    if (c) { chosen[c.dataset.clear] = null; refresh(); $(`[data-q="${c.dataset.clear}"]`, body).focus(); }
    if (e.target.closest('[data-swap]')) { [chosen.a, chosen.b] = [chosen.b, chosen.a]; refresh(); }
    const f = e.target.closest('[data-focus]');
    if (f) { m.close(); onFocus(Number(f.dataset.focus)); }
  });
  refresh();
  setTimeout(() => $(`[data-q="${from ? 'b' : 'a'}"]`, body)?.focus(), 80);
}

// ---------------------------------------------------------------------
//  Anniversaires & souvenirs
// ---------------------------------------------------------------------
export function openCalendar({ onPick }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = [];
  const nextOccurrence = (m, d) => {
    let dt = new Date(today.getFullYear(), m - 1, d);
    if (dt < today) dt = new Date(today.getFullYear() + 1, m - 1, d);
    return dt;
  };
  for (const p of store.persons.values()) {
    const b = parseDate(p.birth_date);
    if (b?.m && b?.d && !p.birth_approx) {
      const dt = nextOccurrence(b.m, b.d);
      items.push({ dt, p, kind: p.is_living ? 'birthday' : 'memory-birth', n: dt.getFullYear() - b.y });
    }
    const d = parseDate(p.death_date);
    if (!p.is_living && d?.m && d?.d) {
      const dt = nextOccurrence(d.m, d.d);
      items.push({ dt, p, kind: 'memory', n: dt.getFullYear() - d.y });
    }
  }
  for (const u of store.unions.values()) {
    const s = parseDate(u.start_date);
    if (u.partners.length === 2 && u.status === 'en_cours' && s?.m && s?.d) {
      const dt = nextOccurrence(s.m, s.d);
      items.push({ dt, u, kind: 'wedding', n: dt.getFullYear() - s.y });
    }
  }
  items.sort((a, b) => a.dt - b.dt);
  const upcoming = items.filter((x) => (x.dt - today) / 864e5 <= 120);

  const label = (it) => {
    if (it.kind === 'birthday') return `<b>${esc(fullName(it.p))}</b> fête ses <b>${it.n} ans</b>`;
    if (it.kind === 'memory-birth') return `${esc(fullName(it.p))} aurait eu ${it.n} ans`;
    if (it.kind === 'memory') return `Il y a ${it.n} an${it.n > 1 ? 's' : ''}, ${esc(fullName(it.p))} nous quittait`;
    const names = it.u.partners.map((id) => firstName(store.person(id))).join(' & ');
    const special = { 1: 'coton', 5: 'bois', 10: 'étain', 20: 'porcelaine', 25: 'argent', 30: 'perle', 40: 'émeraude', 50: 'or', 60: 'diamant', 70: 'platine' }[it.n];
    return `<b>${esc(names)}</b> : ${it.n} an${it.n > 1 ? 's' : ''} d'union${special ? ` — noces de ${special}` : ''}`;
  };
  const when = (dt) => {
    const days = Math.round((dt - today) / 864e5);
    return days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : `Dans ${days} jours`;
  };
  const body = `<div class="calendar">${upcoming.length ? upcoming.map((it) => `
      <button type="button" class="cal-item cal-item--${it.kind}" data-pick="${it.p?.id ?? it.u.partners[0]}">
        <span class="cal-item__date"><b>${it.dt.getDate()}</b><small>${MONTHS_SHORT[it.dt.getMonth()]}</small></span>
        ${it.p ? avatarHtml(it.p, 'size-10') : `<span class="cal-item__ring">${icon('rings', 'size-5')}</span>`}
        <span class="flex-1 min-w-0 text-left"><span class="block text-sm">${label(it)}</span><small class="text-ink-soft">${when(it.dt)}</small></span>
        <span class="cal-item__icon">${icon(it.kind === 'birthday' ? 'sparkle' : it.kind === 'wedding' ? 'heart' : 'star', 'size-4')}</span>
      </button>`).join('') : '<p class="text-center text-ink-soft py-8">Aucune date à venir dans les 4 prochains mois.<br><small>Renseignez des dates complètes (jour et mois) pour les voir ici.</small></p>'}</div>`;
  const m = openModal({ title: 'Anniversaires & souvenirs', subtitle: 'Les 4 prochains mois', body, size: 'md' });
  m.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) { m.close(); onPick(Number(b.dataset.pick)); }
  });
}

// ---------------------------------------------------------------------
//  Statistiques
// ---------------------------------------------------------------------
export function openStats({ onPick }) {
  const persons = [...store.persons.values()];
  const living = persons.filter((p) => p.is_living);
  const dead = persons.filter((p) => !p.is_living);
  const lifespans = dead.map((p) => age(p)).filter((a) => a !== null);
  const avg = lifespans.length ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) : null;
  const longest = dead.filter((p) => age(p) !== null).sort((a, b) => age(b) - age(a))[0];
  const eldest = living.filter((p) => age(p) !== null).sort((a, b) => age(b) - age(a))[0];
  const youngest = living.filter((p) => p.birth_date).sort((a, b) => b.birth_date.localeCompare(a.birth_date))[0];
  const couples = [...store.unions.values()].filter((u) => u.partners.length === 2);
  const remarried = persons.filter((p) => store.coupleUnions(p.id).length > 1).length;

  // Générations : profondeur maximale de descendance
  const memo = new Map();
  const depth = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const kids = store.children(id);
    const d = 1 + (kids.length ? Math.max(...kids.map((k) => depth(k.id, seen))) : 0);
    memo.set(id, d);
    return d;
  };
  const generations = persons.length ? Math.max(...persons.filter((p) => !store.hasParents(p.id)).map((p) => depth(p.id)), 1) : 0;

  const count = (arr) => {
    const m = new Map();
    for (const v of arr) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };
  const names = count(persons.map((p) => p.first_names?.split(/\s+/)[0]));
  const places = count(persons.map((p) => p.birth_place));
  const jobs = count(persons.map((p) => p.occupation));
  const centuries = count(persons.map((p) => year(p.birth_date)).filter(Boolean).map((y) => `${Math.floor(y / 10) * 10}s`)).sort((a, b) => a[0].localeCompare(b[0]));
  const men = persons.filter((p) => p.gender === 'M').length;
  const women = persons.filter((p) => p.gender === 'F').length;

  const bars = (rows) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return rows.length ? `<ul class="bars">${rows.map(([k, v]) => `<li><span class="bars__k">${esc(k)}</span><span class="bars__track"><i style="width:${(v / max) * 100}%"></i></span><b>${v}</b></li>`).join('')}</ul>` : '<p class="text-sm text-ink-soft">Pas encore de données.</p>';
  };
  const tile = (n, l, ic) => `<div class="stat-tile"><span class="stat-tile__icon">${icon(ic, 'size-5')}</span><b>${n}</b><small>${l}</small></div>`;
  const who = (p, txt) => p ? `<button type="button" class="person-row" data-pick="${p.id}">${avatarHtml(p, 'size-10')}<span class="flex-1 min-w-0 text-left"><small class="block text-ink-soft">${txt}</small><b class="block truncate">${esc(fullName(p))}</b></span><span class="text-sm font-semibold">${age(p)} ans</span></button>` : '';

  const body = `
    <div class="stat-grid">
      ${tile(persons.length, 'membres', 'users')}
      ${tile(living.length, 'en vie', 'heart')}
      ${tile(dead.length, 'disparus', 'star')}
      ${tile(generations, 'générations', 'tree')}
      ${tile(couples.length, 'unions', 'rings')}
      ${tile(avg !== null ? avg + ' ans' : '—', 'espérance de vie', 'clock')}
    </div>
    <div class="gender-bar mt-5" title="${men} hommes, ${women} femmes"><i style="flex:${men || 0.0001}"></i><i style="flex:${women || 0.0001}"></i></div>
    <p class="flex justify-between text-xs text-ink-soft mt-1.5"><span>${men} hommes</span><span>${remarried} personne${remarried > 1 ? 's' : ''} remariée${remarried > 1 ? 's' : ''}</span><span>${women} femmes</span></p>
    <div class="space-y-1 mt-5">${who(eldest, 'Doyen(ne) de la famille')}${who(longest, 'Plus longue vie')}${youngest ? `<button type="button" class="person-row" data-pick="${youngest.id}">${avatarHtml(youngest, 'size-10')}<span class="flex-1 min-w-0 text-left"><small class="block text-ink-soft">Benjamin(e) de la famille</small><b class="block truncate">${esc(fullName(youngest))}</b></span><span class="text-sm font-semibold">${esc(formatDate(youngest.birth_date))}</span></button>` : ''}</div>
    <div class="grid sm:grid-cols-2 gap-5 mt-6">
      <section><p class="section-title mb-2">Prénoms les plus portés</p>${bars(names)}</section>
      <section><p class="section-title mb-2">Lieux de naissance</p>${bars(places)}</section>
      <section><p class="section-title mb-2">Métiers</p>${bars(jobs)}</section>
      <section><p class="section-title mb-2">Naissances par décennie</p>${bars(centuries)}</section>
    </div>`;
  const m = openModal({ title: 'La famille en chiffres', body, size: 'lg' });
  m.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) { m.close(); onPick(Number(b.dataset.pick)); }
  });
}

// ---------------------------------------------------------------------
export function openShortcuts() {
  const rows = [
    ['Ctrl + K', 'Rechercher un membre'], ['F', 'Tout afficher'], ['C', 'Recentrer sur la personne au centre'],
    ['H', 'Revenir à la racine'], ['M', 'Aller à ma fiche'], ['+ / −', 'Zoomer / dézoomer'],
    ['Flèches', 'Se déplacer'], ['Double-clic', 'Placer une personne au centre'], ['Entrée', 'Ouvrir la fiche (carte sélectionnée)'],
    ['N', 'Ajouter une personne liée à la fiche ouverte'], ['Échap', 'Fermer'],
  ];
  openModal({ title: 'Raccourcis clavier', size: 'sm', body: `<ul class="shortcuts">${rows.map(([k, v]) => `<li><kbd>${k}</kbd><span>${v}</span></li>`).join('')}</ul>` });
}

export function openPassword() {
  const form = document.createElement('form');
  form.className = 'space-y-3';
  form.innerHTML = `${field('current', 'Mot de passe actuel', '', { type: 'password', required: true })}
    ${field('new', 'Nouveau mot de passe', '', { type: 'password', required: true, hint: '8 caractères minimum' })}
    ${field('confirm', 'Confirmation', '', { type: 'password', required: true })}`;
  const m = openModal({
    title: 'Changer mon mot de passe', body: form, size: 'sm',
    footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button><button type="button" class="btn btn--primary" data-save>Enregistrer</button>`,
  });
  $('[data-save]', m.el).addEventListener('click', async () => {
    const d = Object.fromEntries(new FormData(form));
    if (d.new !== d.confirm) return toast('Les deux mots de passe ne correspondent pas.', 'error');
    try {
      await api('me.password', { body: { current: d.current, new: d.new } });
      m.close();
      toast('Mot de passe modifié.');
    } catch (e) { toast(e.message, 'error'); }
  });
}
