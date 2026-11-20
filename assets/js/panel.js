// =====================================================================
//  Fiche détaillée d'une personne (panneau latéral)
// =====================================================================
import { api, esc, paragraphs, icon, toast, fullName, firstName, avatarHtml, formatDate, lifespan, age, genderize, hue, year, parseDate,
  UNION_TYPES, UNION_STATUSES, CHILD_RELATIONS, EVENT_TYPES, $, $$ } from './core.js';
import { store } from './store.js';
import { openModal, confirmDialog, popMenu } from './modal.js';
import { openPersonForm, openProfessionForm, openEventForm, resizeImage, openUnionEditor } from './forms.js';

const panel = document.getElementById('panel');
let current = null; // personne détaillée
let tab = 'overview';
let cb = {};

export function initPanel(callbacks) {
  cb = callbacks;
  panel.addEventListener('click', onClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open') && !document.querySelector('.modal')) closePanel();
  });
}

export const panelPersonId = () => (panel.classList.contains('is-open') ? current?.id ?? null : null);

export async function openPanel(pid, { tab: t } = {}) {
  if (t) tab = t;
  const quick = store.person(pid);
  if (!quick) return;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  if (current?.id !== pid) {
    current = { ...quick, loading: true };
    render();
    panel.querySelector('.panel__scroll')?.scrollTo(0, 0);
  }
  try {
    const { person } = await api('person', { params: { id: pid } });
    if (person.id !== pid || !panel.classList.contains('is-open')) return;
    current = person;
    render();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export function closePanel() {
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  cb.onClose?.();
}

export async function refreshPanel() {
  if (!panel.classList.contains('is-open') || !current) return;
  if (!store.person(current.id)) return closePanel();
  await openPanel(current.id);
}

// ---------------------------------------------------------------------
function render() {
  const p = current;
  const perms = store.perms;
  const dead = !p.is_living;
  const a = age(p);
  const photos = p.photos ?? [];
  const tabs = [
    ['overview', 'Aperçu', 'user'],
    ['life', 'Vie', 'briefcase'],
    ['family', 'Famille', 'users'],
    ['photos', `Photos${photos.length ? ` <i>${photos.length}</i>` : ''}`, 'image'],
    ['timeline', 'Chronologie', 'clock'],
  ];

  panel.style.setProperty('--h', hue(p.id));
  panel.innerHTML = `
    <div class="panel__scroll">
      <header class="panel__hero ${dead ? 'is-dead' : ''}">
        <div class="panel__hero-bg">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : ''}</div>
        <div class="panel__hero-top">
          <button type="button" class="icon-btn icon-btn--glass" data-act="close" aria-label="Fermer la fiche">${icon('x', 'size-5')}</button>
          <div class="flex gap-2">
            <button type="button" class="icon-btn icon-btn--glass" data-act="focus" data-tip="Placer au centre de l'arbre">${icon('focus', 'size-5')}</button>
            ${perms.edit ? `<button type="button" class="icon-btn icon-btn--glass" data-act="edit" data-tip="Modifier">${icon('edit', 'size-5')}</button>` : ''}
            <button type="button" class="icon-btn icon-btn--glass" data-act="more" aria-label="Plus d'actions">${icon('more', 'size-5')}</button>
          </div>
        </div>
        <div class="panel__identity">
          <button type="button" class="panel__avatar" data-act="avatar" aria-label="Voir la photo">
            ${avatarHtml(p, 'size-28')}
            ${perms.edit ? `<span class="panel__avatar-edit">${icon('camera', 'size-4')}</span>` : ''}
          </button>
          <span class="status-pill ${dead ? 'status-pill--dead' : 'status-pill--alive'}">${dead ? `† ${genderize(p, 'Décédé', 'Décédée', 'Décédé(e)')}` : `<i></i>${genderize(p, 'Vivant', 'Vivante', 'En vie')}`}</span>
          <h2 class="panel__name">${esc(fullName(p))}</h2>
          ${p.nickname ? `<p class="panel__nick">« ${esc(p.nickname)} »</p>` : ''}
          ${p.birth_name && p.birth_name !== p.last_name ? `<p class="panel__birthname">${genderize(p, 'né', 'née', 'né(e)')} ${esc(p.birth_name)}</p>` : ''}
          <p class="panel__dates">${esc(lifespan(p) || 'Dates inconnues')}${a !== null ? ` · ${dead ? `décédé${genderize(p, '', 'e', '(e)')} à ${a} ans` : `${a} ans`}` : ''}</p>
          ${p.occupation ? `<p class="panel__job">${icon('briefcase', 'size-4')}${esc(p.occupation)}</p>` : ''}
        </div>
      </header>

      <nav class="panel__tabs" role="tablist">
        ${tabs.map(([k, l, ic]) => `<button type="button" role="tab" class="ptab ${tab === k ? 'is-active' : ''}" data-tab="${k}" aria-selected="${tab === k}">${icon(ic, 'size-4')}<span>${l}</span></button>`).join('')}
      </nav>

      <div class="panel__content">${p.loading ? skeleton() : renderTab(p)}</div>

      ${!p.loading ? `<footer class="panel__foot">
        ${p.created_by_name ? `Ajouté par ${esc(p.created_by_name)} · ` : ''}${p.created_at ? `le ${formatDate(p.created_at.slice(0, 10))}` : ''}
        ${p.updated_by_name && p.updated_at !== p.created_at ? `<br>Modifié par ${esc(p.updated_by_name)} le ${formatDate(p.updated_at.slice(0, 10))}` : ''}
      </footer>` : ''}
    </div>`;
}

function skeleton() {
  return `<div class="space-y-3 animate-pulse p-1">${'<div class="h-16 rounded-2xl bg-line/60"></div>'.repeat(3)}</div>`;
}

function renderTab(p) {
  switch (tab) {
    case 'life': return renderLife(p);
    case 'family': return renderFamily(p);
    case 'photos': return renderPhotos(p);
    case 'timeline': return renderTimeline(p);
    default: return renderOverview(p);
  }
}

// --- Aperçu ----------------------------------------------------------
function fact(ic, label, value, sub = '') {
  if (!value) return '';
  return `<div class="fact"><span class="fact__icon">${icon(ic, 'size-4')}</span><div class="min-w-0"><p class="fact__label">${label}</p><p class="fact__value">${value}</p>${sub ? `<p class="fact__sub">${sub}</p>` : ''}</div></div>`;
}

function renderOverview(p) {
  const birth = [formatDate(p.birth_date, p.birth_approx), p.birth_place && `à ${esc(p.birth_place)}`].filter(Boolean).join(' ');
  const death = [formatDate(p.death_date, p.death_approx), p.death_place && `à ${esc(p.death_place)}`].filter(Boolean).join(' ');
  const parents = store.parents(p.id);
  const spouses = store.coupleUnions(p.id).map((u) => store.partnerIn(u, p.id));
  const kids = store.children(p.id);
  const facts = [
    fact('baby', genderize(p, 'Né', 'Née', 'Naissance'), esc(birth)),
    !p.is_living ? fact('star', genderize(p, 'Décédé', 'Décédée', 'Décès'), esc(death) || 'Date inconnue', p.death_cause ? `Cause : ${esc(p.death_cause)}` : '') : '',
    !p.is_living && p.burial_place ? fact('pin', 'Sépulture', esc(p.burial_place)) : '',
    fact('home', 'Lieux de vie', esc(p.residence)),
    fact('cap', 'Études', esc(p.education)),
    fact('globe', 'Nationalité', esc(p.nationality)),
    fact('sparkle', 'Religion', esc(p.religion)),
    fact('heart', 'Passions', esc(p.hobbies)),
    p.is_living ? fact('phone', 'Téléphone', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '') : '',
    p.is_living ? fact('mail', 'E-mail', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '') : '',
  ].join('');

  const strip = (title, ids) => ids.length ? `
    <div class="mini-family__group"><p>${title}</p><div class="flex -space-x-2">${ids.map((id) => {
      const x = store.person(id);
      return x ? `<button type="button" class="mini-avatar" data-goto="${id}" data-tip="${esc(fullName(x))}">${avatarHtml(x, 'size-10')}</button>` : '';
    }).join('')}</div></div>` : '';

  return `
    ${facts ? `<div class="facts">${facts}</div>` : emptyNote('Aucun détail renseigné pour le moment.', 'edit', 'Compléter la fiche')}
    ${parents.length || spouses.length || kids.length ? `<div class="mini-family">${strip('Parents', parents.map((x) => x.id))}${strip(spouses.length > 1 ? 'Conjoints' : 'Conjoint(e)', spouses)}${strip('Enfants', kids.map((k) => k.id))}</div>` : ''}
    ${p.biography ? `<section class="prose-block"><h3>${icon('book', 'size-4')}Son histoire</h3><div class="prose-text">${paragraphs(p.biography)}</div></section>` : ''}
    ${p.anecdotes ? `<section class="quote-block">${icon('quote', 'size-6')}<div class="prose-text">${paragraphs(p.anecdotes)}</div></section>` : ''}`;
}

function emptyNote(text, action, label) {
  return `<div class="empty-note"><p>${text}</p>${store.perms.edit && action ? `<button type="button" class="btn btn--soft btn--sm" data-act="${action}">${icon('plus', 'size-4')}${label}</button>` : ''}</div>`;
}

// --- Vie -------------------------------------------------------------
function renderLife(p) {
  const can = store.perms.edit || store.perms.add;
  const jobs = p.professions ?? [];
  return `
    <section class="section">
      <div class="section__head"><h3>${icon('briefcase', 'size-4')}Parcours professionnel</h3>${can ? `<button type="button" class="btn btn--soft btn--sm" data-act="add-job">${icon('plus', 'size-4')}Ajouter</button>` : ''}</div>
      ${jobs.length ? `<ol class="career">${jobs.map((j) => `
        <li class="career__item">
          <span class="career__years">${j.start_year ?? '?'}${j.end_year ? ` – ${j.end_year}` : j.start_year ? ' – …' : ''}</span>
          <div class="career__body">
            <p class="career__title">${esc(j.title)}</p>
            ${j.employer || j.place ? `<p class="career__where">${[j.employer, j.place].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
            ${j.description ? `<div class="career__desc">${paragraphs(j.description)}</div>` : ''}
          </div>
          ${store.perms.edit ? `<div class="row-actions"><button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-job="${j.id}" aria-label="Modifier">${icon('edit', 'size-4')}</button><button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-job-del="${j.id}" aria-label="Supprimer">${icon('trash', 'size-4')}</button></div>` : ''}
        </li>`).join('')}</ol>` : `<p class="text-sm text-ink-soft">${p.occupation ? `Métier principal : <b>${esc(p.occupation)}</b>. ` : ''}Aucun parcours détaillé.</p>`}
    </section>
    <section class="section">
      <div class="section__head"><h3>${icon('book', 'size-4')}Biographie</h3>${store.perms.edit ? `<button type="button" class="btn btn--ghost btn--sm" data-act="edit">${icon('edit', 'size-4')}Modifier</button>` : ''}</div>
      ${p.biography ? `<div class="prose-text">${paragraphs(p.biography)}</div>` : '<p class="text-sm text-ink-soft">Son histoire reste à écrire…</p>'}
    </section>
    ${p.anecdotes ? `<section class="quote-block">${icon('quote', 'size-6')}<div class="prose-text">${paragraphs(p.anecdotes)}</div></section>` : ''}
    ${p.notes ? `<section class="section"><div class="section__head"><h3>${icon('flag', 'size-4')}Notes & sources</h3></div><div class="prose-text text-sm">${paragraphs(p.notes)}</div></section>` : ''}`;
}

// --- Famille ---------------------------------------------------------
function personRow(id, sub = '', extra = '') {
  const x = store.person(id);
  if (!x) return '';
  return `<button type="button" class="person-row ${!x.is_living ? 'is-dead' : ''}" data-goto="${id}">
      ${avatarHtml(x, 'size-11')}
      <span class="min-w-0 flex-1 text-left"><b class="block truncate">${esc(fullName(x))}</b><small>${esc(lifespan(x) || '—')}${sub ? ` · ${sub}` : ''}</small></span>
      ${extra}<span class="person-row__go">${icon('right', 'size-4')}</span></button>`;
}

function renderFamily(p) {
  const perms = store.perms;
  const parentUnions = store.allParentUnions(p.id);
  const unions = store.personUnions(p.id);
  const couples = unions.filter((u) => u.partners.length === 2);
  const solos = unions.filter((u) => u.partners.length === 1);
  const sibs = store.siblings(p.id);

  const parentsHtml = parentUnions.length ? parentUnions.map(({ union, relation }) => `
      <div class="family-card">
        ${relation !== 'biologique' ? `<p class="family-card__tag">${esc(CHILD_RELATIONS[relation])}</p>` : ''}
        ${store.orderedParents(union).map((id) => personRow(id, genderize(store.person(id), 'Père', 'Mère', 'Parent'))).join('')}
        ${union.partners.length < 2 && perms.add ? `<button type="button" class="add-row" data-add="parent">${icon('plus', 'size-4')}Ajouter l'autre parent</button>` : ''}
      </div>`).join('') : `<div class="family-card">${perms.add ? `<button type="button" class="add-row" data-add="parent">${icon('plus', 'size-4')}Ajouter un parent</button>` : '<p class="text-sm text-ink-soft p-2">Parents non renseignés.</p>'}</div>`;

  const unionHtml = couples.map((u, i) => {
    const sp = store.partnerIn(u, p.id);
    const kids = store.unionChildren(u);
    const color = couples.length > 1 ? `var(--u${(i % 5) + 1})` : 'var(--u1)';
    const dates = [u.start_date && formatDate(u.start_date, u.start_approx), u.start_place && `à ${esc(u.start_place)}`].filter(Boolean).join(' ');
    return `<div class="family-card family-card--union" style="--uc:${color}">
        <div class="family-card__union">
          <span class="union-badge">${couples.length > 1 ? i + 1 : icon('rings', 'size-3.5')}</span>
          <div class="min-w-0 flex-1"><b>${esc(UNION_TYPES[u.type] || 'Union')}</b>${dates ? ` <span class="text-ink-soft">· ${dates}</span>` : ''}
            ${u.status !== 'en_cours' ? `<span class="union-status union-status--${u.status}">${esc(UNION_STATUSES[u.status])}${u.end_date ? ` (${formatDate(u.end_date, u.end_approx)})` : ''}</span>` : ''}</div>
          <button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-union="${u.id}" aria-label="Détails de l'union">${icon(perms.edit ? 'edit' : 'info', 'size-4')}</button>
        </div>
        ${personRow(sp, genderize(store.person(sp), 'Époux', 'Épouse', 'Conjoint'))}
        ${kids.length ? `<p class="family-card__sub">${kids.length} enfant${kids.length > 1 ? 's' : ''}</p><div class="pl-3 border-l-2 ml-5" style="border-color:${color}">${kids.map((c) => personRow(c.id, c.relation !== 'biologique' ? esc(CHILD_RELATIONS[c.relation]) : '')).join('')}</div>` : ''}
        ${perms.add ? `<button type="button" class="add-row" data-add="child" data-union-id="${u.id}">${icon('plus', 'size-4')}Ajouter un enfant à cette union</button>` : ''}
      </div>`;
  }).join('');

  const soloHtml = solos.filter((u) => u.children.length).map((u) => `
      <div class="family-card"><p class="family-card__sub">Enfants (autre parent non renseigné)</p>
        ${store.unionChildren(u).map((c) => personRow(c.id)).join('')}</div>`).join('');

  return `
    <section class="section"><div class="section__head"><h3>${icon('up', 'size-4')}Parents</h3></div>${parentsHtml}</section>
    <section class="section"><div class="section__head"><h3>${icon('rings', 'size-4')}${couples.length > 1 ? `Unions (${couples.length})` : 'Union & enfants'}</h3>
      ${perms.add ? `<div class="flex gap-1.5"><button type="button" class="btn btn--soft btn--sm" data-add="spouse">${icon('heart', 'size-4')}Union</button><button type="button" class="btn btn--soft btn--sm" data-add="child">${icon('baby', 'size-4')}Enfant</button></div>` : ''}</div>
      ${unionHtml || soloHtml ? unionHtml + soloHtml : '<p class="text-sm text-ink-soft">Aucune union enregistrée.</p>'}
    </section>
    <section class="section"><div class="section__head"><h3>${icon('users', 'size-4')}Frères & sœurs${sibs.length ? ` (${sibs.length})` : ''}</h3>
      ${perms.add ? `<button type="button" class="btn btn--soft btn--sm" data-add="sibling">${icon('plus', 'size-4')}Ajouter</button>` : ''}</div>
      ${sibs.length ? `<div class="family-card">${sibs.map((s) => personRow(s.id, s.half ? `demi-${genderize(store.person(s.id), 'frère', 'sœur', 'frère/sœur')} (par ${esc(firstName(store.person(s.via)))})` : genderize(store.person(s.id), 'Frère', 'Sœur', 'Frère/sœur'))).join('')}</div>` : '<p class="text-sm text-ink-soft">Aucun frère ni sœur connu.</p>'}
    </section>`;
}

// --- Photos ----------------------------------------------------------
function renderPhotos(p) {
  const photos = p.photos ?? [];
  const can = store.perms.edit || store.perms.add;
  return `
    ${can ? `<label class="upload-zone" data-upload-zone>
        <input type="file" accept="image/*" multiple class="hidden" data-upload>
        ${icon('upload', 'size-6')}<span><b>Ajouter des photos</b><br><small>Glissez-déposez ou cliquez · plusieurs à la fois</small></span>
      </label>` : ''}
    <div class="upload-progress hidden" data-progress></div>
    ${photos.length ? `<div class="gallery">${photos.map((ph, i) => `
        <button type="button" class="gallery__item ${ph.id === p.photo_id ? 'is-primary' : ''}" data-photo="${i}">
          <img src="${esc(ph.thumb)}" alt="${esc(ph.caption || '')}" loading="lazy">
          ${ph.id === p.photo_id ? `<span class="gallery__badge">${icon('star', 'size-3')}Profil</span>` : ''}
          ${ph.year || ph.caption ? `<span class="gallery__cap">${ph.year ? `<b>${ph.year}</b> ` : ''}${esc(ph.caption || '')}</span>` : ''}
        </button>`).join('')}</div>` : '<p class="text-sm text-ink-soft text-center py-6">Aucune photo pour le moment.</p>'}`;
}

function openLightbox(index) {
  const photos = current.photos ?? [];
  let i = index;
  const perms = store.perms;
  const wrap = document.createElement('div');
  wrap.className = 'lightbox';
  const draw = () => {
    const ph = photos[i];
    wrap.innerHTML = `
      <div class="lightbox__stage">
        ${photos.length > 1 ? `<button type="button" class="lightbox__nav lightbox__nav--prev" data-nav="-1" aria-label="Précédente">${icon('left', 'size-6')}</button>` : ''}
        <img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}">
        ${photos.length > 1 ? `<button type="button" class="lightbox__nav lightbox__nav--next" data-nav="1" aria-label="Suivante">${icon('right', 'size-6')}</button>` : ''}
      </div>
      <div class="lightbox__bar">
        ${perms.edit ? `<input class="lightbox__caption" data-cap value="${esc(ph.caption || '')}" placeholder="Ajouter une légende…">
          <input class="lightbox__year" data-year type="number" value="${ph.year ?? ''}" placeholder="Année">
          <button type="button" class="btn btn--soft btn--sm" data-save-cap>${icon('check', 'size-4')}</button>
          ${ph.id !== current.photo_id ? `<button type="button" class="btn btn--soft btn--sm" data-primary>${icon('star', 'size-4')}Photo de profil</button>` : ''}
          <button type="button" class="btn btn--ghost btn--sm text-danger" data-del-photo>${icon('trash', 'size-4')}</button>`
          : `<p class="flex-1">${ph.year ? `<b>${ph.year}</b> · ` : ''}${esc(ph.caption || '')}</p>`}
        <span class="text-xs opacity-70 ml-auto">${i + 1} / ${photos.length}</span>
      </div>`;
  };
  draw();
  const m = openModal({ title: esc(fullName(current)), body: wrap, size: 'xl', className: 'modal--lightbox' });
  const nav = (d) => { i = (i + d + photos.length) % photos.length; draw(); };
  const keys = (e) => { if (e.key === 'ArrowLeft') nav(-1); if (e.key === 'ArrowRight') nav(1); };
  document.addEventListener('keydown', keys);
  const obs = new MutationObserver(() => { if (!m.el.isConnected) { document.removeEventListener('keydown', keys); obs.disconnect(); } });
  obs.observe(m.el.parentNode, { childList: true });

  wrap.addEventListener('click', async (e) => {
    const ph = photos[i];
    if (e.target.closest('[data-nav]')) nav(Number(e.target.closest('[data-nav]').dataset.nav));
    if (e.target.closest('[data-save-cap]')) {
      try {
        await api('photo.update', { body: { id: ph.id, caption: $('[data-cap]', wrap).value, year: $('[data-year]', wrap).value } });
        ph.caption = $('[data-cap]', wrap).value;
        ph.year = $('[data-year]', wrap).value || null;
        toast('Légende enregistrée.');
      } catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.closest('[data-primary]')) {
      try {
        await api('photo.primary', { body: { id: ph.id } });
        toast('Nouvelle photo de profil.');
        m.close();
        cb.onChanged?.();
      } catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.closest('[data-del-photo]')) {
      if (!(await confirmDialog({ title: 'Supprimer cette photo ?', message: '<p>La photo sera définitivement supprimée.</p>', confirm: 'Supprimer', danger: true }))) return;
      try {
        await api('photo.delete', { body: { id: ph.id } });
        toast('Photo supprimée.');
        m.close();
        cb.onChanged?.();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

async function uploadPhotos(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  const prog = $('[data-progress]', panel);
  prog?.classList.remove('hidden');
  let done = 0;
  for (const f of list) {
    if (prog) prog.innerHTML = `<span class="spinner"></span> Envoi ${done + 1} / ${list.length}…<div class="bar"><i style="width:${(done / list.length) * 100}%"></i></div>`;
    try {
      const blob = await resizeImage(f);
      const fd = new FormData();
      fd.append('person_id', current.id);
      fd.append('photo', blob, f.name.replace(/\.\w+$/, '.jpg'));
      await api('photo.upload', { body: fd });
    } catch (e) { toast(`${f.name} : ${e.message}`, 'error'); }
    done++;
  }
  toast(`${done} photo${done > 1 ? 's' : ''} ajoutée${done > 1 ? 's' : ''}.`);
  tab = 'photos';
  cb.onChanged?.();
}

// --- Chronologie -----------------------------------------------------
function renderTimeline(p) {
  const items = [];
  const add = (date, approx, ic, title, sub = '', kind = '') => date && items.push({ date, approx, ic, title, sub, kind });
  add(p.birth_date, p.birth_approx, 'baby', genderize(p, 'Naissance', 'Naissance'), p.birth_place ? `à ${esc(p.birth_place)}` : '', 'birth');
  for (const u of store.coupleUnions(p.id)) {
    const sp = store.person(store.partnerIn(u, p.id));
    add(u.start_date, u.start_approx, 'rings', `${esc(UNION_TYPES[u.type] || 'Union')} avec ${esc(fullName(sp))}`, u.start_place ? `à ${esc(u.start_place)}` : '', 'union');
    if (u.end_date && (u.status === 'divorce' || u.status === 'separe')) add(u.end_date, u.end_approx, 'unlink', `${esc(UNION_STATUSES[u.status])} d'avec ${esc(firstName(sp))}`, '', 'union');
    if (sp && !sp.is_living && sp.death_date && (!p.death_date || sp.death_date <= p.death_date)) add(sp.death_date, sp.death_approx, 'star', `Décès de ${esc(fullName(sp))}`, genderize(sp, 'son époux', 'son épouse', 'son conjoint'), 'loss');
  }
  for (const c of store.children(p.id)) {
    const k = store.person(c.id);
    add(k?.birth_date, k?.birth_approx, 'baby', `Naissance de ${genderize(k, 'son fils', 'sa fille', 'son enfant')} ${esc(firstName(k))}`, c.relation !== 'biologique' ? esc(CHILD_RELATIONS[c.relation]) : '', 'child');
  }
  for (const par of store.parents(p.id)) {
    const x = store.person(par.id);
    if (x && !x.is_living && x.death_date && x.death_date >= (p.birth_date || '0') && (!p.death_date || x.death_date <= p.death_date)) {
      add(x.death_date, x.death_approx, 'star', `Décès de ${genderize(x, 'son père', 'sa mère', 'son parent')} ${esc(firstName(x))}`, '', 'loss');
    }
  }
  for (const j of p.professions ?? []) if (j.start_year) add(String(j.start_year), false, 'briefcase', esc(j.title), [j.employer, j.place].filter(Boolean).map(esc).join(' · '), 'job');
  for (const ev of p.events ?? []) add(ev.event_date, ev.date_approx, EVENT_TYPES[ev.type]?.[1] || 'dot', esc(ev.title), [ev.place && esc(ev.place), ev.description && esc(ev.description)].filter(Boolean).join(' — '), `event" data-event="${ev.id}`);
  add(p.death_date, p.death_approx, 'star', 'Décès', [p.death_place && `à ${esc(p.death_place)}`, p.death_cause && esc(p.death_cause)].filter(Boolean).join(' · '), 'death');
  items.sort((a, b) => a.date.localeCompare(b.date));

  const birth = parseDate(p.birth_date);
  const can = store.perms.edit || store.perms.add;
  return `
    <div class="section__head mb-2"><h3>${icon('clock', 'size-4')}Les grandes étapes</h3>${can ? `<button type="button" class="btn btn--soft btn--sm" data-act="add-event">${icon('plus', 'size-4')}Événement</button>` : ''}</div>
    ${items.length ? `<ol class="timeline">${items.map((it) => {
      const y = year(it.date);
      const ag = birth && y ? y - birth.y : null;
      return `<li class="timeline__item timeline__item--${it.kind}">
        <span class="timeline__dot">${icon(it.ic, 'size-3.5')}</span>
        <div class="timeline__body">
          <p class="timeline__date">${esc(formatDate(it.date, it.approx))}${ag !== null && ag >= 0 && it.kind !== 'birth' ? `<span>${ag} an${ag > 1 ? 's' : ''}</span>` : ''}</p>
          <p class="timeline__title">${it.title}</p>
          ${it.sub ? `<p class="timeline__sub">${it.sub}</p>` : ''}
        </div>
        ${it.kind.startsWith('event') && store.perms.edit ? `<button type="button" class="icon-btn icon-btn--ghost icon-btn--sm timeline__edit" data-event-edit="${it.kind.match(/data-event="(\d+)/)?.[1]}">${icon('edit', 'size-4')}</button>` : ''}
      </li>`;
    }).join('')}</ol>` : '<p class="text-sm text-ink-soft">Ajoutez des dates (naissance, union…) ou des événements pour construire la chronologie.</p>'}`;
}

// ---------------------------------------------------------------------
//  Actions
// ---------------------------------------------------------------------
async function onClick(e) {
  const t = e.target;
  const tabBtn = t.closest('[data-tab]');
  if (tabBtn) {
    tab = tabBtn.dataset.tab;
    render();
    return;
  }
  const go = t.closest('[data-goto]');
  if (go) return cb.onSelect?.(Number(go.dataset.goto), { reveal: true });

  const addBtn = t.closest('[data-add]');
  if (addBtn) return cb.onAdd?.(addBtn.dataset.add, current.id, addBtn.dataset.unionId ? Number(addBtn.dataset.unionId) : undefined);

  const un = t.closest('[data-union]');
  if (un) return openUnionEditor(Number(un.dataset.union), { onSaved: () => cb.onChanged?.(), onAddChild: (pid, uid) => cb.onAdd?.('child', pid, uid) });

  const ph = t.closest('[data-photo]');
  if (ph) return openLightbox(Number(ph.dataset.photo));

  if (t.closest('[data-job]')) {
    const j = current.professions.find((x) => x.id == t.closest('[data-job]').dataset.job);
    return openProfessionForm(current.id, j, () => cb.onChanged?.());
  }
  if (t.closest('[data-job-del]')) {
    const id = t.closest('[data-job-del]').dataset.jobDel;
    if (!(await confirmDialog({ title: 'Supprimer ce métier ?', message: '<p>Cette étape du parcours sera supprimée.</p>', confirm: 'Supprimer', danger: true }))) return;
    try { await api('profession.delete', { body: { id } }); cb.onChanged?.(); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  if (t.closest('[data-event-edit]')) {
    const ev = current.events.find((x) => x.id == t.closest('[data-event-edit]').dataset.eventEdit);
    return openEventEditor(ev);
  }

  const act = t.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'close') closePanel();
  if (act === 'focus') cb.onFocus?.(current.id);
  if (act === 'edit') openPersonForm({ mode: 'edit', person: current, onSaved: () => cb.onChanged?.() });
  if (act === 'add-job') openProfessionForm(current.id, {}, () => cb.onChanged?.());
  if (act === 'add-event') openEventForm(current.id, {}, () => cb.onChanged?.());
  if (act === 'avatar') {
    if (store.perms.edit) openPersonForm({ mode: 'edit', person: current, onSaved: () => cb.onChanged?.() });
    else if (current.photos?.length) { const idx = current.photos.findIndex((x) => x.id === current.photo_id); openLightbox(Math.max(0, idx)); }
  }
  if (act === 'more') {
    const items = [
      { label: 'Placer au centre de l\'arbre', icon: 'focus', action: () => cb.onFocus?.(current.id) },
      { label: 'Calculer un lien de parenté', icon: 'link', action: () => cb.onKinship?.(current.id) },
    ];
    if (store.perms.edit) items.push({ label: 'Définir comme racine de l\'arbre', icon: 'home', action: () => cb.onSetRoot?.(current.id) });
    if (store.perms.delete) items.push('-', { label: 'Supprimer de l\'arbre', icon: 'trash', danger: true, action: () => deletePerson() });
    popMenu(t.closest('[data-act]'), items);
  }
}

function openEventEditor(ev) {
  const m = openEventForm(current.id, ev, () => cb.onChanged?.());
  return m;
}

async function deletePerson() {
  const p = current;
  const imp = p.delete_impact ?? { unions: 0, children: 0, parent_links: 0 };
  const lines = [];
  if (imp.unions) lines.push(`${imp.unions} union${imp.unions > 1 ? 's' : ''} n'apparaîtr${imp.unions > 1 ? 'ont' : 'a'} plus avec ${genderize(p, 'lui', 'elle', 'cette personne')}`);
  if (imp.children) lines.push(`${imp.children} enfant${imp.children > 1 ? 's' : ''} perdr${imp.children > 1 ? 'ont' : 'a'} ce parent dans l'arbre`);
  const ok = await confirmDialog({
    title: `Supprimer ${fullName(p)} ?`, danger: true, confirm: 'Mettre à la corbeille',
    message: `<p><b>${esc(fullName(p))}</b> sera retiré${genderize(p, '', 'e', '(e)')} de l'arbre et placé${genderize(p, '', 'e', '(e)')} dans la corbeille. Un administrateur pourra ${genderize(p, 'le', 'la', 'la')} restaurer.</p>`,
    details: lines.length ? `<ul class="impact">${lines.map((l) => `<li>${l}</li>`).join('')}</ul><p class="text-xs text-ink-soft mt-2">Les autres membres de la famille ne sont pas supprimés.</p>` : '',
  });
  if (!ok) return;
  try {
    await api('person.delete', { body: { id: p.id } });
    toast(`${fullName(p)} a été placé${genderize(p, '', 'e', '(e)')} dans la corbeille.`);
    closePanel();
    cb.onDeleted?.(p.id);
  } catch (err) { toast(err.message, 'error'); }
}

// Glisser-déposer de photos sur la zone d'envoi
panel.addEventListener('dragover', (e) => {
  const z = e.target.closest('[data-upload-zone]');
  if (z) { e.preventDefault(); z.classList.add('is-over'); }
});
panel.addEventListener('dragleave', (e) => e.target.closest('[data-upload-zone]')?.classList.remove('is-over'));
panel.addEventListener('drop', (e) => {
  const z = e.target.closest('[data-upload-zone]');
  if (!z) return;
  e.preventDefault();
  z.classList.remove('is-over');
  uploadPhotos(e.dataTransfer.files);
});
panel.addEventListener('change', (e) => {
  if (e.target.matches('[data-upload]')) uploadPhotos(e.target.files);
});
