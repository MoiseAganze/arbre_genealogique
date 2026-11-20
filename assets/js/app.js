// =====================================================================
//  Application principale : relie l'arbre, la fiche, les formulaires
// =====================================================================
import { esc, icon, toast, fullName, firstName, avatarHtml, api, $, $$ } from './core.js';
import { store } from './store.js';
import { TreeView } from './tree.js';
import { initTheme } from './theme.js';
import { getSky } from './background.js';
import { initPanel, openPanel, closePanel, refreshPanel, panelPersonId } from './panel.js';
import { openPersonForm, openUnionEditor } from './forms.js';
import { openSearch, rememberRecent, openKinship, openCalendar, openStats, openShortcuts, openPassword } from './features.js';
import { topModal } from './modal.js';

initTheme();

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

const tree = new TreeView({
  viewport: $('#viewport'),
  world: $('#world'),
  nodesEl: $('#nodes'),
  linksEl: $('#links'),
  minimap: $('#minimap'),
  onSelect: (pid) => select(pid),
  onFocus: (pid) => focus(pid),
  onAdd: (type, pid) => addRelative(type, pid),
  onUnion: (uid) => openUnionEditor(uid, { onSaved: reload, onAddChild: (pid, unionId) => addRelative('child', pid, unionId) }),
  onCamera: (cam) => getSky()?.setOffset(cam.x, cam.y),
});

Object.assign(tree.options, LS.get('arbre-view', {}));
tree.options.collapsed = new Set(LS.get('arbre-collapsed', []));

initPanel({
  onSelect: (pid, o) => select(pid, o),
  onFocus: (pid) => focus(pid),
  onAdd: (type, pid, unionId) => addRelative(type, pid, unionId),
  onChanged: reload,
  onDeleted: async (id) => {
    await store.load();
    if (tree.focusId === id || !store.person(tree.focusId)) tree.focusId = store.rootId();
    renderAll();
  },
  onClose: () => tree.select(null),
  onKinship: (pid) => openKinship({ from: pid, onFocus: (id) => focus(id, { open: true }) }),
  onSetRoot: async (pid) => {
    try {
      await api('settings.save', { body: { root_person_id: pid } });
      store.settings.root_person_id = pid;
      toast(`${fullName(store.person(pid))} est maintenant la racine de l'arbre.`);
    } catch (e) { toast(e.message, 'error'); }
  },
});

// ---------------------------------------------------------------------
//  Navigation
// ---------------------------------------------------------------------
let trail = LS.get('arbre-trail', []);

function focus(pid, { open = false, animate = true } = {}) {
  if (!store.person(pid)) return;
  tree.render({ focusId: pid, animate });
  LS.set('arbre-focus', pid);
  history.replaceState(null, '', `#p${pid}`);
  trail = [pid, ...trail.filter((x) => x !== pid)].slice(0, 7);
  LS.set('arbre-trail', trail);
  renderTrail();
  rememberRecent(pid);
  if (open || panelPersonId()) select(pid);
}

function select(pid, { reveal = false } = {}) {
  if (!store.person(pid)) return;
  tree.select(pid);
  openPanel(pid);
  rememberRecent(pid);
  if (reveal) {
    if (tree.positionOf(pid)) tree.centerOnPerson(pid);
    else focus(pid);
  }
}

function renderTrail() {
  const el = $('#trail');
  const items = trail.filter((id) => store.person(id));
  el.innerHTML = items.length > 1 ? `<span class="trail__label">${icon('clock', 'size-3.5')}</span>` + items.map((id) => {
    const p = store.person(id);
    return `<button type="button" class="trail__item ${id === tree.focusId ? 'is-current' : ''}" data-trail="${id}" data-tip="${esc(fullName(p))}">${avatarHtml(p, 'size-7')}<span>${esc(firstName(p))}</span></button>`;
  }).join('') : '';
}
$('#trail').addEventListener('click', (e) => {
  const b = e.target.closest('[data-trail]');
  if (b) focus(Number(b.dataset.trail));
});

// ---------------------------------------------------------------------
//  Ajout / rechargement
// ---------------------------------------------------------------------
function addRelative(type, pid, unionId) {
  if (!store.perms.add) return toast("Vous n'avez pas la permission d'ajouter des personnes.", 'error');
  openPersonForm({
    mode: 'create',
    relation: { type, of: pid, union_id: unionId },
    onSaved: async (id) => {
      await store.load();
      // On garde la personne de départ au centre, sauf si la nouvelle n'est pas visible
      tree.render({ focusId: tree.focusId && store.person(tree.focusId) ? tree.focusId : id });
      if (!tree.positionOf(id)) focus(id);
      else setTimeout(() => tree.centerOnPerson(id, 700), 250);
      flash(id);
      select(id);
      showEmpty();
    },
  });
}

function addFirst(prefill = {}) {
  openPersonForm({
    mode: 'create',
    relation: { type: 'none' },
    person: { gender: 'U', is_living: true, ...prefill },
    onSaved: async (id) => {
      await store.load();
      showEmpty();
      focus(id, { open: true });
      flash(id);
    },
  });
}

function flash(pid) {
  setTimeout(() => {
    $$(`.card[data-pid="${pid}"]`).forEach((el) => {
      el.classList.add('is-new');
      setTimeout(() => el.classList.remove('is-new'), 1800);
    });
  }, 80);
}

async function reload() {
  try {
    await store.load();
    if (!store.person(tree.focusId)) tree.focusId = store.rootId();
    renderAll(false);
    await refreshPanel();
  } catch (e) { toast(e.message, 'error'); }
}

function renderAll(recenter = false) {
  showEmpty();
  if (tree.focusId) tree.render({ recenter });
  renderTrail();
}

function showEmpty() {
  const empty = store.persons.size === 0;
  $('#empty-state').classList.toggle('hidden', !empty);
  document.body.classList.toggle('is-empty', empty);
  document.body.classList.toggle('is-guest', !!store.me?.guest);
  $('[data-action="add-first"]').classList.toggle('hidden', !store.perms.add);
  if (empty && !store.perms.add) {
    $('#empty-state p').textContent = store.me?.guest
      ? "L'arbre de la famille est encore vide. Revenez bientôt, ou connectez-vous si vous avez un compte pour commencer à le remplir."
      : "L'arbre est encore vide. Votre compte permet seulement de consulter : demandez à l'administrateur le droit d'ajouter des membres.";
  }
}

// ---------------------------------------------------------------------
//  Boutons, menus, popovers
// ---------------------------------------------------------------------
const actions = {
  search: () => openSearch({ onPick: (id) => focus(id, { open: true }), onCreate: (p) => addFirst(p) }),
  kinship: () => openKinship({ from: panelPersonId(), onFocus: (id) => focus(id, { open: true }) }),
  calendar: () => openCalendar({ onPick: (id) => focus(id, { open: true }) }),
  stats: () => openStats({ onPick: (id) => focus(id, { open: true }) }),
  shortcuts: openShortcuts,
  password: openPassword,
  'add-first': () => addFirst(),
  'zoom-in': () => tree.zoomBy(1.25, undefined, undefined, 220),
  'zoom-out': () => tree.zoomBy(0.8, undefined, undefined, 220),
  fit: () => tree.fit(),
  center: () => tree.centerOn(0, 0, Math.max(0.8, tree.cam.k)),
  home: () => { const r = store.rootId(); if (r) focus(r); },
  me: () => {
    if (store.me?.guest) return toast('Connectez-vous pour retrouver votre propre fiche.', 'info');
    const id = store.me?.person_id;
    if (id && store.person(id)) focus(id, { open: true });
    else toast("Votre compte n'est relié à aucune personne de l'arbre. Demandez à l'administrateur de le faire.", 'info', 5000);
  },
  depth: (btn) => togglePopover('depth', btn),
  legend: (btn) => togglePopover('legend', btn),
  'user-menu': () => $('[data-menu="user"]').classList.toggle('hidden'),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && actions[btn.dataset.action]) {
    e.preventDefault();
    if (btn.closest('[data-menu]')) btn.closest('[data-menu]').classList.add('hidden');
    actions[btn.dataset.action](btn);
    return;
  }
  if (!e.target.closest('[data-menu], [data-action="user-menu"]')) $('[data-menu="user"]')?.classList.add('hidden');
  if (!e.target.closest('.popover, [data-action="depth"], [data-action="legend"]')) $$('.popover').forEach((p) => p.classList.add('hidden'));
});

function togglePopover(name, btn) {
  const pop = $(`[data-popover="${name}"]`);
  const show = pop.classList.contains('hidden');
  $$('.popover').forEach((p) => p.classList.add('hidden'));
  if (!show) return;
  pop.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  const left = r.right + 12;
  pop.style.left = `${Math.min(left, innerWidth - pop.offsetWidth - 12)}px`;
  pop.style.top = `${Math.max(76, Math.min(r.top - 8, innerHeight - pop.offsetHeight - 12))}px`;
}

// Réglage des générations
const depthPop = $('[data-popover="depth"]');
for (const input of $$('[data-depth]', depthPop)) {
  const key = input.dataset.depth;
  input.value = tree.options[key];
  $(`[data-out="${key}"]`, depthPop).textContent = input.value;
  input.addEventListener('input', () => {
    tree.options[key] = Number(input.value);
    $(`[data-out="${key}"]`, depthPop).textContent = input.value;
    saveView();
    tree.render();
  });
}
for (const cb of $$('[data-opt]', depthPop)) {
  cb.checked = !!tree.options[cb.dataset.opt];
  cb.addEventListener('change', () => {
    tree.options[cb.dataset.opt] = cb.checked;
    saveView();
    tree.render();
  });
}
function saveView() {
  const { up, down, siblings, compact } = tree.options;
  LS.set('arbre-view', { up, down, siblings, compact });
}

// ---------------------------------------------------------------------
//  Clavier
// ---------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!topModal()) actions.search();
    return;
  }
  if (typing || topModal() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); actions.search(); }
  else if (k === '+' || k === '=') actions['zoom-in']();
  else if (k === '-' || k === '_') actions['zoom-out']();
  else if (k === 'f' || k === 'F') actions.fit();
  else if (k === 'c' || k === 'C') actions.center();
  else if (k === 'h' || k === 'H') actions.home();
  else if (k === 'm' || k === 'M') actions.me();
  else if ((k === 'n' || k === 'N') && store.perms.add) {
    const pid = panelPersonId() ?? tree.focusId;
    if (pid) quickAddMenu(pid);
    else addFirst();
  }
  else if (k === '?') openShortcuts();
  else if (k.startsWith('Arrow')) {
    e.preventDefault();
    const s = 60;
    tree.panBy(k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0);
  }
});

function quickAddMenu(pid) {
  const p = store.person(pid);
  import('./modal.js').then(({ openModal }) => {
    const opts = [['parent', 'Un parent', 'up'], ['spouse', 'Un conjoint / une union', 'heart'], ['child', 'Un enfant', 'baby'], ['sibling', 'Un frère ou une sœur', 'users']];
    const m = openModal({
      title: `Ajouter à la famille de ${esc(firstName(p))}`, size: 'sm',
      body: `<div class="quick-add">${opts.map(([t, l, ic], i) => `<button type="button" class="quick-add__btn" data-t="${t}"><span>${icon(ic, 'size-5')}</span>${l}<kbd>${i + 1}</kbd></button>`).join('')}</div>`,
    });
    const go = (t) => { m.close(); addRelative(t, pid); };
    m.body.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) go(b.dataset.t); });
    m.el.addEventListener('keydown', (e) => { const i = Number(e.key) - 1; if (opts[i]) go(opts[i][0]); });
  });
}

// ---------------------------------------------------------------------
//  Info-bulles
// ---------------------------------------------------------------------
const tip = $('#tooltip');
let tipTarget = null;
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (t === tipTarget) return;
  tipTarget = t;
  if (!t || e.pointerType === 'touch') { tip.classList.remove('is-on'); return; }
  tip.textContent = t.dataset.tip;
  const r = t.getBoundingClientRect();
  tip.classList.add('is-on');
  const w = tip.offsetWidth;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(innerWidth - w - 8, x));
  let y = r.top - tip.offsetHeight - 8;
  if (y < 8) y = r.bottom + 8;
  tip.style.transform = `translate(${x}px, ${y}px)`;
});
document.addEventListener('pointerdown', () => { tip.classList.remove('is-on'); tipTarget = null; });

// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
(async function start() {
  try {
    await store.load();
  } catch (e) {
    toast(e.message, 'error', 8000);
    return;
  }
  showEmpty();
  if (!store.persons.size) return;
  const fromHash = Number((location.hash.match(/^#p(\d+)/) || [])[1]);
  const saved = LS.get('arbre-focus', null);
  const first = [fromHash, saved, store.rootId()].find((id) => id && store.person(id));
  tree.render({ focusId: first, animate: false });
  renderTrail();
  trail = [first, ...trail.filter((x) => x !== first)].slice(0, 7);
  document.body.classList.add('is-ready');
})();

window.addEventListener('hashchange', () => {
  const id = Number((location.hash.match(/^#p(\d+)/) || [])[1]);
  if (id && id !== tree.focusId) focus(id);
});
window.addEventListener('themechange', () => tree.drawMinimap());
