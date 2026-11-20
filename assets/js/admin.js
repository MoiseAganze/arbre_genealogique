// =====================================================================
//  Administration : utilisateurs & permissions, corbeille, journal
// =====================================================================
import { api, esc, icon, toast, fullName, lifespan, avatarHtml, formatDate, debounce, $, $$ } from './core.js';
import { initTheme } from './theme.js';
import { store } from './store.js';
import { openModal, confirmDialog } from './modal.js';
import { field, searchPersons, pickItem } from './forms.js';

initTheme();

let data = { users: [], trash: [], log: [], stats: {}, settings: {} };
const me = Number(document.body.dataset.me || 0);

async function load() {
  try {
    data = await api('admin.overview');
    await store.load(); // pour relier un compte à une personne
    render();
  } catch (e) { toast(e.message, 'error'); }
}

function render() {
  const s = data.stats;
  $('[data-stats]').innerHTML = [
    [s.persons, 'membres'], [data.users.length, 'comptes'], [s.photos, 'photos'],
  ].map(([n, l]) => `<div class="admin__stat"><b>${n ?? 0}</b><small>${l}</small></div>`).join('');
  $('[data-count="trash"]').textContent = s.trash || '';
  renderUsers();
  renderTrash();
  renderLog();
  renderSettings();
}

// --- Onglets ---------------------------------------------------------
$$('[data-tab]').forEach((t) => t.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === t));
  $$('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
}));

// --- Utilisateurs ----------------------------------------------------
const PERMS = [['can_add', 'Ajouter', 'plus'], ['can_edit', 'Modifier', 'edit'], ['can_delete', 'Supprimer', 'trash']];

function renderUsers() {
  const pane = $('[data-pane="users"]');
  pane.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <p class="text-sm text-ink-soft max-w-xl">Un administrateur a tous les droits. Pour les membres, choisissez précisément ce qu'ils peuvent faire. Sans aucune case cochée, un membre peut seulement consulter l'arbre.</p>
      <button type="button" class="btn btn--primary" data-new-user>${icon('plus', 'size-4')}Nouvel utilisateur</button>
    </div>
    <div class="user-list">${data.users.map(userCard).join('')}</div>`;
}

function userCard(u) {
  const person = u.person_id ? store.person(u.person_id) : null;
  const admin = u.role === 'admin';
  return `<article class="user-card ${u.is_active ? '' : 'is-inactive'}" data-user="${u.id}">
      <div class="user-card__avatar" style="--h:${(u.id * 137.5) % 360}">${esc(u.display_name.slice(0, 1).toUpperCase())}</div>
      <div class="user-card__main">
        <p class="font-semibold truncate">${esc(u.display_name)} ${admin ? '<span class="role-badge">Admin</span>' : ''} ${u.is_active ? '' : '<span class="role-badge role-badge--off">Désactivé</span>'}</p>
        <p class="text-xs text-ink-soft truncate">@${esc(u.username)}${u.email ? ' · ' + esc(u.email) : ''}</p>
        <p class="text-xs text-ink-soft mt-0.5">${person ? `${icon('user', 'size-3 inline')} ${esc(fullName(person))} · ` : ''}${u.last_login_at ? `Dernière connexion le ${formatDate(u.last_login_at.slice(0, 10))}` : 'Jamais connecté'}</p>
      </div>
      <div class="user-card__perms">${PERMS.map(([k, l, ic]) => `
        <label class="perm ${admin ? 'is-locked' : ''}" data-tip="${admin ? 'Un administrateur a tous les droits' : l}">
          <input type="checkbox" data-perm="${k}" ${admin || u[k] ? 'checked' : ''} ${admin ? 'disabled' : ''}>
          <span>${icon(ic, 'size-3.5')}${l}</span></label>`).join('')}</div>
      <div class="user-card__actions">
        <button type="button" class="icon-btn icon-btn--ghost" data-edit-user aria-label="Modifier" data-tip="Modifier">${icon('edit', 'size-4')}</button>
        <button type="button" class="icon-btn icon-btn--ghost text-danger" data-del-user aria-label="Supprimer" data-tip="Supprimer">${icon('trash', 'size-4')}</button>
      </div>
    </article>`;
}

$('[data-pane="users"]').addEventListener('change', async (e) => {
  const cb = e.target.closest('[data-perm]');
  if (!cb) return;
  const u = data.users.find((x) => x.id === Number(cb.closest('[data-user]').dataset.user));
  const next = { ...u, [cb.dataset.perm]: cb.checked };
  try {
    await api('user.save', { body: { ...next, password: '' } });
    u[cb.dataset.perm] = cb.checked;
    toast(`Permissions de ${u.display_name} mises à jour.`);
  } catch (err) {
    cb.checked = !cb.checked;
    toast(err.message, 'error');
  }
});

$('[data-pane="users"]').addEventListener('click', async (e) => {
  if (e.target.closest('[data-new-user]')) return userForm();
  const card = e.target.closest('[data-user]');
  if (!card) return;
  const u = data.users.find((x) => x.id === Number(card.dataset.user));
  if (e.target.closest('[data-edit-user]')) return userForm(u);
  if (e.target.closest('[data-del-user]')) {
    const ok = await confirmDialog({ title: `Supprimer le compte de ${u.display_name} ?`, message: '<p>Cette personne ne pourra plus se connecter. Les fiches de l\'arbre ne sont pas touchées.</p>', confirm: 'Supprimer le compte', danger: true });
    if (!ok) return;
    try { await api('user.delete', { body: { id: u.id } }); toast('Compte supprimé.'); load(); } catch (err) { toast(err.message, 'error'); }
  }
});

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(12));
  return [...arr].map((n) => chars[n % chars.length]).join('');
}

function userForm(u = null) {
  const isNew = !u;
  u ??= { role: 'member', can_add: true, can_edit: true, can_delete: false, is_active: true };
  const linked = u.person_id ? store.person(u.person_id) : null;
  const form = document.createElement('form');
  form.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${field('display_name', 'Nom affiché', u.display_name, { required: true, placeholder: 'Tante Marie' })}
      ${field('username', 'Identifiant de connexion', u.username, { required: true, placeholder: 'marie.dupont' })}
      ${field('email', 'E-mail (facultatif)', u.email, { type: 'email' })}
      <label class="field"><span>${isNew ? 'Mot de passe' : 'Nouveau mot de passe'} ${isNew ? '<i class="text-danger not-italic">*</i>' : ''}</span>
        <div class="flex gap-2"><input name="password" type="text" autocomplete="new-password" placeholder="${isNew ? '8 caractères minimum' : 'Laisser vide pour ne pas changer'}" class="flex-1 min-w-0">
        <button type="button" class="btn btn--soft btn--sm shrink-0" data-gen data-tip="Générer un mot de passe">${icon('sparkle', 'size-4')}</button></div></label>
    </div>
    <p class="section-title mt-5 mb-2">Rôle</p>
    <div class="role-pick">
      <label class="role-opt"><input type="radio" name="role" value="member" ${u.role !== 'admin' ? 'checked' : ''}><span><b>Membre</b><small>Droits choisis ci-dessous</small></span></label>
      <label class="role-opt"><input type="radio" name="role" value="admin" ${u.role === 'admin' ? 'checked' : ''}><span><b>Administrateur</b><small>Tous les droits + gestion des comptes</small></span></label>
    </div>
    <div class="perm-grid mt-3" data-perms>${PERMS.map(([k, l, ic]) => `
      <label class="perm perm--big"><input type="checkbox" name="${k}" ${u[k] ? 'checked' : ''}><span>${icon(ic, 'size-4')}${l}</span></label>`).join('')}</div>
    <p class="section-title mt-5 mb-2">Personne correspondante dans l'arbre</p>
    <input type="hidden" name="person_id" value="${u.person_id ?? ''}">
    <div data-linked>${linked ? linkedChip(linked) : ''}</div>
    <div class="relative ${linked ? 'hidden' : ''}" data-link-search>
      <input type="search" class="input" placeholder="Rechercher la personne (facultatif)…" data-q autocomplete="off">
      <div class="pick-list pick-list--float hidden" data-list></div>
    </div>
    <label class="check mt-4"><input type="checkbox" name="is_active" ${u.is_active ? 'checked' : ''}><span>Compte actif (peut se connecter)</span></label>`;

  const m = openModal({
    title: isNew ? 'Nouvel utilisateur' : `Modifier ${esc(u.display_name)}`, body: form, size: 'md',
    footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button><button type="button" class="btn btn--primary" data-save>${icon('check', 'size-4')}${isNew ? 'Créer le compte' : 'Enregistrer'}</button>`,
  });

  const syncRole = () => {
    const admin = form.elements.role.value === 'admin';
    $$('[data-perms] input', form).forEach((i) => { i.disabled = admin; if (admin) i.checked = true; });
    $('[data-perms]', form).classList.toggle('opacity-50', admin);
  };
  form.addEventListener('change', (e) => e.target.name === 'role' && syncRole());
  syncRole();

  $('[data-gen]', form).addEventListener('click', () => {
    form.elements.password.value = generatePassword();
    form.elements.password.select();
  });

  const q = $('[data-q]', form);
  const list = $('[data-list]', form);
  q.addEventListener('input', debounce(() => {
    const res = searchPersons(q.value, 6);
    list.classList.toggle('hidden', !res.length);
    list.innerHTML = res.map(pickItem).join('');
  }, 100));
  list.addEventListener('click', (e) => {
    const it = e.target.closest('[data-pick]');
    if (!it) return;
    form.elements.person_id.value = it.dataset.pick;
    $('[data-linked]', form).innerHTML = linkedChip(store.person(Number(it.dataset.pick)));
    $('[data-link-search]', form).classList.add('hidden');
    list.classList.add('hidden');
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-unlink]')) {
      form.elements.person_id.value = '';
      $('[data-linked]', form).innerHTML = '';
      $('[data-link-search]', form).classList.remove('hidden');
    }
  });

  $('[data-save]', m.el).addEventListener('click', async () => {
    const f = form.elements;
    const body = {
      id: u.id ?? null,
      display_name: f.display_name.value, username: f.username.value, email: f.email.value,
      password: f.password.value, role: f.role.value,
      can_add: f.can_add.checked, can_edit: f.can_edit.checked, can_delete: f.can_delete.checked,
      is_active: f.is_active.checked, person_id: f.person_id.value || null,
    };
    try {
      await api('user.save', { body });
      m.close();
      toast(isNew ? `Compte créé. Communiquez l'identifiant « ${body.username} » et le mot de passe à la personne.` : 'Compte mis à jour.', 'success', isNew ? 7000 : 3500);
      load();
    } catch (err) { toast(err.message, 'error'); }
  });
}

const linkedChip = (p) => `<div class="kin-chip">${avatarHtml(p, 'size-10')}<div class="min-w-0"><b class="block truncate">${esc(fullName(p))}</b><small>${esc(lifespan(p))}</small></div><button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-unlink aria-label="Retirer">${icon('x', 'size-4')}</button></div>`;

// --- Corbeille -------------------------------------------------------
function renderTrash() {
  const pane = $('[data-pane="trash"]');
  pane.innerHTML = data.trash.length ? `
    <p class="text-sm text-ink-soft mb-4">Les personnes supprimées restent ici jusqu'à leur restauration ou leur suppression définitive (photos comprises).</p>
    <div class="space-y-2">${data.trash.map((p) => `
      <div class="trash-row" data-id="${p.id}">
        ${avatarHtml({ ...p, photo: null }, 'size-10')}
        <div class="flex-1 min-w-0"><b class="block truncate">${esc(fullName(p))}</b>
          <small class="text-ink-soft">Supprimé le ${formatDate(p.deleted_at.slice(0, 10))}${p.deleted_by_name ? ' par ' + esc(p.deleted_by_name) : ''}</small></div>
        <button type="button" class="btn btn--soft btn--sm" data-restore>${icon('check', 'size-4')}Restaurer</button>
        <button type="button" class="btn btn--ghost btn--sm text-danger" data-purge>${icon('trash', 'size-4')}<span class="hidden sm:inline">Supprimer définitivement</span></button>
      </div>`).join('')}</div>` : `<div class="empty-note"><p>${icon('trash', 'size-6 mx-auto mb-2 opacity-60')}La corbeille est vide.</p></div>`;
}

$('[data-pane="trash"]').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-id]');
  if (!row) return;
  const p = data.trash.find((x) => x.id == row.dataset.id);
  if (e.target.closest('[data-restore]')) {
    try { await api('person.restore', { body: { id: p.id } }); toast(`${fullName(p)} est de retour dans l'arbre.`); load(); } catch (err) { toast(err.message, 'error'); }
  }
  if (e.target.closest('[data-purge]')) {
    const ok = await confirmDialog({ title: 'Suppression définitive', danger: true, confirm: 'Supprimer pour toujours', message: `<p><b>${esc(fullName(p))}</b>, ses photos, métiers et événements seront effacés définitivement. Cette action est irréversible.</p>` });
    if (!ok) return;
    try { await api('person.purge', { body: { id: p.id } }); toast('Supprimé définitivement.'); load(); } catch (err) { toast(err.message, 'error'); }
  }
});

// --- Journal ---------------------------------------------------------
const LOG_ICONS = { create: 'plus', update: 'edit', delete: 'trash', restore: 'check', purge: 'x', link: 'link', unlink: 'unlink' };
function renderLog() {
  const pane = $('[data-pane="log"]');
  let lastDay = '';
  pane.innerHTML = data.log.length ? `<ol class="log">${data.log.map((l) => {
    const day = l.created_at.slice(0, 10);
    const head = day !== lastDay ? `<li class="log__day">${formatDate(day)}</li>` : '';
    lastDay = day;
    return `${head}<li class="log__item log__item--${l.action}"><span class="log__icon">${icon(LOG_ICONS[l.action] || 'dot', 'size-3.5')}</span>
      <span class="flex-1 min-w-0">${esc(l.summary)}</span>
      <small class="text-ink-soft shrink-0">${esc(l.user_name || 'Système')} · ${l.created_at.slice(11, 16)}</small></li>`;
  }).join('')}</ol>` : '<div class="empty-note"><p>Aucune modification enregistrée.</p></div>';
}

// --- Réglages --------------------------------------------------------
function renderSettings() {
  const pane = $('[data-pane="settings"]');
  const pub = data.settings.public_view;
  const link = new URL('index.php', location.href).href;
  pane.innerHTML = `<div class="space-y-4 max-w-xl">
    <div class="glass-card">
      <div class="flex items-start gap-4">
        <div class="flex-1 min-w-0">
          <p class="font-semibold">Consultation publique</p>
          <p class="text-sm text-ink-soft mt-1">${pub
            ? "Toute personne qui a le lien peut <b>voir</b> l'arbre et les fiches, sans compte. Elle ne peut rien modifier, et ne voit ni les téléphones, ni les e-mails, ni les notes privées."
            : "Seules les personnes ayant un compte peuvent voir l'arbre."}</p>
        </div>
        <label class="switch" data-tip="${pub ? 'Rendre l\'arbre privé' : 'Rendre l\'arbre public'}">
          <input type="checkbox" data-public ${pub ? 'checked' : ''}><span></span>
        </label>
      </div>
      ${pub ? `<div class="share-link mt-4">
          <input class="input" value="${esc(link)}" readonly data-link>
          <button type="button" class="btn btn--soft shrink-0" data-copy>${icon('link', 'size-4')}Copier le lien</button>
        </div>` : ''}
    </div>
    <div class="glass-card">
      <form class="space-y-4" data-settings>
        ${field('family_name', "Nom de l'arbre", data.settings.family_name, { required: true })}
        <button class="btn btn--primary">${icon('check', 'size-4')}Enregistrer</button>
      </form>
    </div></div>`;
  $('[data-public]', pane).addEventListener('change', async (e) => {
    try {
      await api('settings.save', { body: { public_view: e.target.checked } });
      data.settings.public_view = e.target.checked;
      toast(e.target.checked ? "L'arbre est maintenant visible par toute personne ayant le lien." : "L'arbre est maintenant privé : connexion obligatoire.");
      renderSettings();
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
  });
  $('[data-copy]', pane)?.addEventListener('click', async () => {
    const input = $('[data-link]', pane);
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    toast('Lien copié.');
  });
  $('[data-settings]', pane).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.elements.family_name.value;
    try {
      await api('settings.save', { body: { family_name: name } });
      $$('[data-family-name]').forEach((n) => (n.textContent = name));
      toast('Réglages enregistrés.');
    } catch (err) { toast(err.message, 'error'); }
  });
}

load();
void me;
