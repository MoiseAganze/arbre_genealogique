// =====================================================================
//  Formulaires : personne (ajout / modification), union, métier,
//  événement, recadrage de photo.
// =====================================================================
import { api, esc, icon, toast, fullName, firstName, genderize, formatDate, avatarHtml, lifespan, normalize, debounce, UNION_TYPES, UNION_STATUSES, CHILD_RELATIONS, EVENT_TYPES, $, $$ } from './core.js';
import { store } from './store.js';
import { openModal, confirmDialog } from './modal.js';

// ---------------------------------------------------------------------
//  Petits constructeurs de champs
// ---------------------------------------------------------------------
const attr = (v) => esc(v ?? '');

export function field(name, label, value = '', { type = 'text', placeholder = '', cls = '', required = false, hint = '', list = '' } = {}) {
  const input = type === 'textarea'
    ? `<textarea name="${name}" rows="4" placeholder="${attr(placeholder)}">${esc(value ?? '')}</textarea>`
    : `<input name="${name}" type="${type}" value="${attr(value)}" placeholder="${attr(placeholder)}" ${required ? 'required' : ''} ${list ? `list="${list}"` : ''} autocomplete="off">`;
  return `<label class="field ${cls}"><span>${label}${required ? ' <i class="text-danger not-italic">*</i>' : ''}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
}

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Champ date : calendrier natif (type="date").
 * Case « Date incomplète » : année seule, ou mois + année (fréquent pour les ancêtres).
 * Case « Environ » : date approximative.
 */
export function dateField(prefix, label, iso, approx, { cls = '' } = {}) {
  const parts = String(iso || '').split('-');
  const partial = !!iso && parts.length < 3;
  const [y, m] = parts;
  const max = prefix === 'birth' || prefix === 'death' ? new Date().toISOString().slice(0, 10) : '';
  return `<div class="field field--date ${cls}" data-datefield="${prefix}">
      <span>${label}</span>
      <input type="date" data-d-full value="${partial ? '' : attr(iso)}" ${max ? `max="${max}"` : ''} min="0001-01-01" class="${partial ? 'hidden' : ''}" aria-label="${attr(label)}">
      <div class="date-partial ${partial ? '' : 'hidden'}">
        <select data-d-month aria-label="Mois"><option value="">Mois inconnu</option>${MONTH_NAMES.map((mo, i) => `<option value="${i + 1}" ${Number(m) === i + 1 ? 'selected' : ''}>${mo}</option>`).join('')}</select>
        <input type="number" data-d-year min="1" max="2200" step="1" placeholder="Année" value="${partial ? attr(y) : ''}" aria-label="Année">
      </div>
      <div class="date-opts">
        <label class="mini-check"><input type="checkbox" data-d-partial ${partial ? 'checked' : ''}><span>Date incomplète</span></label>
        <label class="mini-check"><input type="checkbox" data-d-approx ${approx ? 'checked' : ''}><span>Environ</span></label>
        <small class="date-preview" data-preview>${iso ? '→ ' + esc(formatDate(iso, approx)) : ''}</small>
      </div>
    </div>`;
}

/** Valeur ISO partielle d'un champ date : 'AAAA-MM-JJ', 'AAAA-MM', 'AAAA' ou '' */
function readDateField(box) {
  const partial = $('[data-d-partial]', box).checked;
  const approx = $('[data-d-approx]', box).checked;
  if (!partial) return { value: $('[data-d-full]', box).value || '', approx };
  const y = $('[data-d-year]', box).value.trim();
  const m = $('[data-d-month]', box).value;
  if (!y) {
    if (m) throw new Error('indiquez au moins l\'année.');
    return { value: '', approx };
  }
  const yn = parseInt(y, 10);
  if (!(yn >= 1 && yn <= 2200)) throw new Error(`année invalide (${y}).`);
  return { value: String(yn).padStart(4, '0') + (m ? '-' + String(m).padStart(2, '0') : ''), approx };
}

export function select(name, label, options, value, { cls = '' } = {}) {
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}">${Object.entries(options)
    .map(([k, v]) => `<option value="${attr(k)}" ${String(k) === String(value) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}

function segmented(name, options, value) {
  return `<div class="segmented" role="radiogroup">${options.map(([v, label, ic]) => `
    <label class="segmented__opt"><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? 'checked' : ''}>
      <span>${ic ? icon(ic, 'size-4') : ''}${label}</span></label>`).join('')}</div>`;
}

/** Active l'aperçu des dates et retourne un lecteur de formulaire */
function wireDates(root) {
  for (const box of $$('[data-datefield]', root)) {
    const full = $('[data-d-full]', box);
    const partialBox = $('.date-partial', box);
    const toggle = $('[data-d-partial]', box);
    const year = $('[data-d-year]', box);
    const month = $('[data-d-month]', box);
    const prev = $('[data-preview]', box);
    const update = () => {
      try {
        const r = readDateField(box);
        prev.textContent = r.value ? `→ ${formatDate(r.value, r.approx)}` : '';
        prev.classList.remove('text-danger');
      } catch (e) {
        prev.textContent = e.message;
        prev.classList.add('text-danger');
      }
    };
    toggle.addEventListener('change', () => {
      const on = toggle.checked;
      // Ce qui est déjà saisi passe d'un mode à l'autre
      if (on && full.value) {
        const [y, m] = full.value.split('-');
        year.value = String(parseInt(y, 10));
        month.value = String(parseInt(m, 10));
      }
      full.classList.toggle('hidden', on);
      partialBox.classList.toggle('hidden', !on);
      (on ? year : full).focus();
      update();
    });
    box.addEventListener('input', update);
    box.addEventListener('change', update);
  }
}

function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'radio' && !el.checked) continue;
    if (el.type === 'checkbox') { data[el.name] = el.checked; continue; }
    if (el.type === 'file') continue;
    data[el.name] = el.value;
  }
  // Champs date → prefix_date + prefix_approx
  for (const box of $$('[data-datefield]', form)) {
    const label = box.querySelector('span')?.textContent || 'Date';
    let r;
    try { r = readDateField(box); } catch (e) { throw new Error(`${label} : ${e.message}`); }
    data[`${box.dataset.datefield}_date`] = r.value;
    data[`${box.dataset.datefield}_approx`] = r.approx;
  }
  return data;
}

async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${btn.dataset.busy || 'Enregistrement…'}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------------------------------------------------------------------
//  Personne
// ---------------------------------------------------------------------
const RELATION_TITLES = {
  none: () => 'Nouvelle personne',
  child: (p) => `Ajouter un enfant de ${esc(firstName(p))}`,
  parent: (p) => `Ajouter un parent de ${esc(firstName(p))}`,
  spouse: (p) => `Nouvelle union pour ${esc(firstName(p))}`,
  sibling: (p) => `Ajouter un frère ou une sœur de ${esc(firstName(p))}`,
};

/**
 * @param {{mode:'create'|'edit', relation?:{type:string, of?:number, union_id?:any}, person?:object, onSaved?:Function}} o
 */
export function openPersonForm({ mode = 'create', relation = { type: 'none' }, person = null, onSaved }) {
  const ref = relation.of ? store.person(relation.of) : null;
  const isEdit = mode === 'edit';
  const p = person ?? defaultsFor(relation, ref);
  if (!isEdit && relation.type === 'sibling' && ref && !store.hasParents(ref.id)) {
    toast(`Ajoutez d'abord un parent à ${firstName(ref)} pour pouvoir lui ajouter un frère ou une sœur.`, 'info', 5000);
    return openPersonForm({ mode, relation: { type: 'parent', of: ref.id }, onSaved });
  }

  const title = isEdit ? `Modifier ${esc(fullName(p))}` : RELATION_TITLES[relation.type](ref);
  const subtitle = isEdit ? 'Les champs vides seront simplement ignorés' : relation.type === 'none' ? 'Seuls le prénom et le statut sont indispensables' : relationHint(relation, ref);

  const form = document.createElement('form');
  form.className = 'person-form';
  form.noValidate = true;
  form.innerHTML = `
    ${!isEdit && relation.type !== 'none' ? `
      <div class="tabs tabs--pill mb-5" role="tablist">
        <button type="button" class="tab is-active" data-mode="new">${icon('plus', 'size-4')}Nouvelle personne</button>
        <button type="button" class="tab" data-mode="existing">${icon('link', 'size-4')}Déjà dans l'arbre</button>
      </div>` : ''}

    <div data-pane="existing" class="hidden space-y-3">
      <label class="field"><span>Rechercher la personne</span><input type="search" data-existing-search placeholder="Tapez un nom…" autocomplete="off"></label>
      <div class="pick-list" data-existing-list><p class="text-sm text-ink-soft px-1">Commencez à taper pour trouver la personne à relier.</p></div>
      <input type="hidden" name="existing_id" value="">
    </div>

    <div data-pane="new">
      <div class="form-grid">
        <div class="photo-drop" data-photo-drop tabindex="0" role="button" aria-label="Ajouter une photo">
          <div class="photo-drop__preview">${p.photo ? `<img src="${attr(p.photo)}" alt="">` : `<span class="photo-drop__empty">${icon('camera', 'size-7')}<span>Photo</span></span>`}</div>
          <input type="file" accept="image/*" class="hidden" data-photo-input>
          <span class="photo-drop__hint">Glisser ou cliquer</span>
        </div>
        <div class="space-y-3 min-w-0">
          ${segmented('gender', [['M', 'Homme', ''], ['F', 'Femme', ''], ['U', 'Non précisé', '']], p.gender || 'U')}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            ${field('first_names', 'Prénom(s)', p.first_names, { required: true, placeholder: 'Jean Pierre' })}
            ${field('last_name', 'Nom', p.last_name, { placeholder: 'Kabongo' })}
            ${field('postnom', 'Postnom', p.postnom, { placeholder: 'Mutombo' })}
          </div>
          <div class="duplicates hidden" data-duplicates></div>
        </div>
      </div>

      <div class="mt-4">${segmented('is_living', [['1', 'En vie', 'heart'], ['0', 'Décédé(e)', 'star']], p.is_living === false || p.is_living === 0 ? '0' : '1')}</div>

      <section class="form-section">
        <h3 class="form-section__title">${icon('baby', 'size-4')}Naissance</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${dateField('birth', 'Date de naissance', p.birth_date, p.birth_approx)}
          ${field('birth_place', 'Lieu de naissance', p.birth_place, { placeholder: 'Ville, pays', list: 'places-list' })}
        </div>
      </section>

      <section class="form-section" data-death-section>
        <h3 class="form-section__title">${icon('star', 'size-4')}Décès</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${dateField('death', 'Date du décès', p.death_date, p.death_approx)}
          ${field('death_place', 'Lieu du décès', p.death_place, { list: 'places-list' })}
          ${field('death_cause', 'Cause (facultatif)', p.death_cause)}
          ${field('burial_place', 'Lieu de sépulture', p.burial_place)}
        </div>
      </section>

      ${relationBlock(relation, ref, isEdit)}

      <details class="form-more" ${isEdit ? 'open' : ''}>
        <summary>${icon('plus', 'size-4')}<span>Plus de détails : métier, histoire, coordonnées…</span></summary>
        <section class="form-section">
          <h3 class="form-section__title">${icon('user', 'size-4')}Identité</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${field('birth_name', 'Nom de naissance / de jeune fille', p.birth_name)}
            ${field('nickname', 'Surnom', p.nickname, { placeholder: 'Pépé Jo, Tata Lili…' })}
            ${field('nationality', 'Nationalité', p.nationality)}
            ${field('religion', 'Religion', p.religion)}
          </div>
        </section>
        <section class="form-section">
          <h3 class="form-section__title">${icon('briefcase', 'size-4')}Vie</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${field('occupation', 'Métier principal', p.occupation, { hint: 'Affiché sur la carte. Le parcours détaillé se remplit dans la fiche.' })}
            ${field('education', 'Études / formation', p.education)}
            ${field('residence', 'Lieux de vie', p.residence, { placeholder: 'Lyon, puis Paris' })}
            ${field('hobbies', 'Passions & loisirs', p.hobbies)}
          </div>
        </section>
        <section class="form-section">
          <h3 class="form-section__title">${icon('book', 'size-4')}Histoire</h3>
          ${field('biography', 'Biographie', p.biography, { type: 'textarea', placeholder: 'Son enfance, son parcours, ce qui l\'a marqué…' })}
          <div class="mt-3">${field('anecdotes', 'Anecdotes & souvenirs', p.anecdotes, { type: 'textarea', placeholder: 'Une histoire que l\'on raconte encore aux repas de famille…' })}</div>
        </section>
        <section class="form-section" data-contact-section>
          <h3 class="form-section__title">${icon('phone', 'size-4')}Coordonnées</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${field('phone', 'Téléphone', p.phone, { type: 'tel' })}
            ${field('email', 'E-mail', p.email, { type: 'email' })}
          </div>
        </section>
        <section class="form-section">
          ${field('notes', 'Notes privées / sources', p.notes, { type: 'textarea', placeholder: 'Actes d\'état civil, témoignages, archives consultées…' })}
        </section>
      </details>
    </div>
    <datalist id="places-list">${placesOptions()}</datalist>`;

  const m = openModal({
    title, subtitle, body: form, size: 'lg',
    footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button>
             <button type="button" class="btn btn--primary" data-submit>${icon('check', 'size-4')}${isEdit ? 'Enregistrer' : 'Ajouter'}</button>`,
  });

  wireDates(form);

  // Statut vivant / décédé
  const deathSection = $('[data-death-section]', form);
  const contactSection = $('[data-contact-section]', form);
  const syncLiving = () => {
    const living = form.elements.is_living.value === '1';
    deathSection.classList.toggle('is-collapsed', living);
    contactSection?.classList.toggle('hidden', !living);
  };
  form.addEventListener('change', (e) => e.target.name === 'is_living' && syncLiving());
  syncLiving();

  // Photo
  let photoBlob = null;
  const drop = $('[data-photo-drop]', form);
  const input = $('[data-photo-input]', form);
  const setPhoto = async (file) => {
    if (!file?.type?.startsWith('image/')) return toast('Choisissez une image.', 'error');
    const blob = await openCropper(file);
    if (!blob) return;
    photoBlob = blob;
    $('.photo-drop__preview', drop).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()));
  input.addEventListener('change', () => input.files[0] && setPhoto(input.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); setPhoto(e.dataTransfer.files[0]); });

  // Onglets nouvelle / existante
  let modeNew = true;
  $$('[data-mode]', form).forEach((tab) => tab.addEventListener('click', () => {
    modeNew = tab.dataset.mode === 'new';
    $$('[data-mode]', form).forEach((t) => t.classList.toggle('is-active', t === tab));
    $('[data-pane="new"]', form).classList.toggle('hidden', !modeNew);
    $('[data-pane="existing"]', form).classList.toggle('hidden', modeNew);
    $('[data-submit]', m.el).innerHTML = `${icon(modeNew ? 'check' : 'link', 'size-4')}${modeNew ? 'Ajouter' : 'Relier'}`;
    if (!modeNew) setTimeout(() => $('[data-existing-search]', form).focus(), 30);
  }));
  const exList = $('[data-existing-list]', form);
  const exInput = $('[data-existing-search]', form);
  exInput?.addEventListener('input', debounce(() => {
    const res = searchPersons(exInput.value, 8, new Set([relation.of]));
    exList.innerHTML = res.length ? res.map((x) => pickItem(x)).join('') : '<p class="text-sm text-ink-soft px-1">Aucun résultat.</p>';
  }, 120));
  exList?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-pick]');
    if (!item) return;
    $$('[data-pick]', exList).forEach((n) => n.classList.toggle('is-picked', n === item));
    form.elements.existing_id.value = item.dataset.pick;
  });

  // Doublons potentiels
  const dupBox = $('[data-duplicates]', form);
  if (!isEdit) {
    const check = debounce(() => {
      const fn = form.elements.first_names.value.trim();
      const ln = `${form.elements.last_name.value.trim()} ${form.elements.postnom.value.trim()}`.trim();
      if (fn.length < 2) { dupBox.classList.add('hidden'); return; }
      const res = searchPersons(`${fn} ${ln}`, 3, new Set([relation.of])).filter((x) => x.score >= 2);
      if (!res.length || relation.type === 'none') { dupBox.classList.add('hidden'); return; }
      dupBox.classList.remove('hidden');
      dupBox.innerHTML = `<p>${icon('info', 'size-4')} Cette personne existe peut-être déjà :</p>${res.map((x) => `
          <button type="button" class="dup" data-use="${x.p.id}">${avatarHtml(x.p, 'size-7')}<span>${esc(fullName(x.p))} <small>${esc(lifespan(x.p))}</small></span><b>Relier</b></button>`).join('')}`;
    }, 250);
    form.elements.first_names.addEventListener('input', check);
    form.elements.last_name.addEventListener('input', check);
    form.elements.postnom.addEventListener('input', check);
    dupBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-use]');
      if (!b) return;
      form.elements.existing_id.value = b.dataset.use;
      submit(true);
    });
  }

  // Envoi
  const btn = $('[data-submit]', m.el);
  const submit = (forceExisting = false) => busy(btn, async () => {
    try {
      const useExisting = forceExisting || !modeNew;
      const data = readForm(form);
      const rel = { type: relation.type, of: relation.of, union_id: data.rel_union ?? relation.union_id, child_relation: data.child_relation };
      if (relation.type === 'spouse') {
        rel.union = { type: data.u_type, status: data.u_status, start_date: data.ustart_date, start_approx: data.ustart_approx, start_place: data.u_place, end_date: data.uend_date, end_approx: data.uend_approx };
      }
      if (useExisting && !data.existing_id) throw new Error('Choisissez une personne dans la liste.');
      if (!useExisting && !String(data.first_names || '').trim()) {
        form.elements.first_names.focus();
        form.elements.first_names.classList.add('is-invalid');
        throw new Error('Le prénom est obligatoire.');
      }
      let id;
      if (isEdit) {
        await api('person.update', { body: { id: p.id, person: data } });
        id = p.id;
      } else {
        const res = await api('person.create', { body: { person: data, relation: rel, existing_id: useExisting ? data.existing_id : null } });
        id = res.id;
      }
      if (photoBlob) {
        const fd = new FormData();
        fd.append('person_id', id);
        fd.append('primary', '1');
        fd.append('photo', photoBlob, 'portrait.jpg');
        await api('photo.upload', { body: fd }).catch((e) => toast(`Photo non enregistrée : ${e.message}`, 'error'));
      }
      m.close();
      toast(isEdit ? 'Modifications enregistrées.' : useExisting ? 'Lien ajouté.' : `${String(data.first_names).split(' ')[0]} a rejoint l'arbre !`);
      onSaved?.(id);
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
  });
  btn.addEventListener('click', () => submit());
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') { e.preventDefault(); submit(); }
  });
  return m;
}

function defaultsFor(relation, ref) {
  const d = { gender: 'U', is_living: true, last_name: '' };
  if (!ref) return d;
  if (relation.type === 'child' || relation.type === 'sibling') {
    // Nom du père de préférence
    let name = ref.last_name;
    if (relation.type === 'child') {
      const u = relation.union_id && relation.union_id !== 'solo' ? store.union(relation.union_id) : store.coupleUnions(ref.id)[0];
      const father = u?.partners.map((id) => store.person(id)).find((x) => x?.gender === 'M');
      if (father) name = father.last_name;
      else if (ref.gender === 'F' && ref.birth_name) name = ref.birth_name;
    } else if (ref.gender === 'F' && ref.birth_name) name = ref.birth_name;
    d.last_name = name || '';
  }
  if (relation.type === 'parent') {
    const pu = store.parentUnion(ref.id);
    const existing = pu?.union.partners.map((id) => store.person(id)) ?? [];
    if (existing.length === 1) d.gender = existing[0].gender === 'M' ? 'F' : existing[0].gender === 'F' ? 'M' : 'U';
    else d.gender = 'M';
    if (d.gender === 'M') d.last_name = ref.last_name;
    d.is_living = year0(ref.birth_date) && year0(ref.birth_date) < 1950 ? false : true;
  }
  if (relation.type === 'spouse') {
    d.gender = ref.gender === 'M' ? 'F' : ref.gender === 'F' ? 'M' : 'U';
  }
  return d;
}

const year0 = (s) => (s ? parseInt(s, 10) : null);

function relationHint(relation, ref) {
  if (!ref) return '';
  if (relation.type === 'parent') {
    const pu = store.parentUnion(ref.id);
    if (pu && pu.union.partners.length === 1) {
      const other = store.person(pu.union.partners[0]);
      return `Sera ajouté(e) comme second parent, aux côtés de ${esc(fullName(other))}`;
    }
    return `Père, mère ou parent adoptif de ${esc(fullName(ref))}`;
  }
  if (relation.type === 'spouse') {
    const n = store.coupleUnions(ref.id).length;
    return n ? `Ce sera la ${n + 1}<sup>e</sup> union de ${esc(firstName(ref))}` : `Mariage, PACS, union libre…`;
  }
  if (relation.type === 'sibling') return 'Il ou elle partagera les mêmes parents';
  return '';
}

function relationBlock(relation, ref, isEdit) {
  if (isEdit || !ref) return '';
  if (relation.type === 'child') {
    const opts = {};
    store.coupleUnions(ref.id).forEach((u, i, all) => {
      const sp = store.person(store.partnerIn(u, ref.id));
      opts[u.id] = `${all.length > 1 ? `${i + 1}${i ? 'e' : 're'} union — ` : ''}avec ${fullName(sp)}`;
    });
    opts.solo = 'Autre parent inconnu / non renseigné';
    const def = relation.union_id ?? Object.keys(opts)[0];
    return `<section class="form-section form-section--accent">
        <h3 class="form-section__title">${icon('users', 'size-4')}Filiation</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${select('rel_union', `Autre parent`, opts, def)}
          ${select('child_relation', 'Lien', CHILD_RELATIONS, 'biologique')}
        </div></section>`;
  }
  if (relation.type === 'parent' || relation.type === 'sibling') {
    return `<section class="form-section form-section--accent">
        <h3 class="form-section__title">${icon('users', 'size-4')}Filiation</h3>
        ${select('child_relation', 'Type de lien', CHILD_RELATIONS, 'biologique')}</section>`;
  }
  if (relation.type === 'spouse') {
    return `<section class="form-section form-section--accent">
        <h3 class="form-section__title">${icon('rings', 'size-4')}L'union</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${select('u_type', 'Type', UNION_TYPES, 'mariage')}
          ${select('u_status', 'Situation', UNION_STATUSES, 'en_cours')}
          ${dateField('ustart', 'Date de l\'union', null, false)}
          ${field('u_place', 'Lieu', '', { list: 'places-list' })}
          ${dateField('uend', 'Date de fin (divorce, décès…)', null, false)}
        </div></section>`;
  }
  return '';
}

function placesOptions() {
  const set = new Set();
  for (const p of store.persons.values()) {
    if (p.birth_place) set.add(p.birth_place);
    if (p.death_place) set.add(p.death_place);
  }
  return [...set].sort().map((v) => `<option value="${attr(v)}">`).join('');
}

export function pickItem({ p }) {
  return `<button type="button" class="pick" data-pick="${p.id}">${avatarHtml(p, 'size-9')}
      <span class="min-w-0"><b class="block truncate">${esc(fullName(p))}</b><small class="text-ink-soft">${esc(lifespan(p) || '—')}${p.birth_place ? ' · ' + esc(p.birth_place) : ''}</small></span>
      <span class="pick__check">${icon('check', 'size-4')}</span></button>`;
}

/** Recherche floue sur les noms */
export function searchPersons(q, limit = 10, exclude = new Set()) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const p of store.persons.values()) {
    if (exclude.has(p.id)) continue;
    const hay = normalize([p.first_names, p.last_name, p.postnom, p.birth_name, p.nickname].filter(Boolean).join(' '));
    const words = hay.split(/\s+/);
    let score = 0;
    let all = true;
    for (const t of terms) {
      if (words.some((w) => w === t)) score += 2;
      else if (words.some((w) => w.startsWith(t))) score += 1.5;
      else if (hay.includes(t)) score += 0.8;
      else { all = false; }
    }
    if (all && score > 0) out.push({ p, score });
  }
  return out.sort((a, b) => b.score - a.score || fullName(a.p).localeCompare(fullName(b.p))).slice(0, limit);
}

// ---------------------------------------------------------------------
//  Union
// ---------------------------------------------------------------------
export async function openUnionEditor(unionId, { onSaved, onAddChild } = {}) {
  let u;
  try { u = (await api('union', { params: { id: unionId } })).union; } catch (e) { return toast(e.message, 'error'); }
  const tu = store.union(unionId);
  const partners = (tu?.partners ?? []).map((id) => store.person(id));
  const solo = partners.length < 2;
  const can = store.perms;
  const form = document.createElement('form');
  form.innerHTML = `
    <div class="union-hero">
      ${partners.map((p) => `<div class="union-hero__p">${avatarHtml(p, 'size-14')}<b>${esc(fullName(p))}</b><small>${esc(lifespan(p))}</small></div>`).join(`<div class="union-hero__ring">${icon('rings', 'size-6')}</div>`)}
      ${solo ? '<div class="union-hero__p opacity-60"><span class="avatar avatar--initials size-14">?</span><b>Autre parent inconnu</b></div>' : ''}
    </div>
    ${solo ? '' : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
      ${select('type', 'Type d\'union', UNION_TYPES, u.type)}
      ${select('status', 'Situation', UNION_STATUSES, u.status)}
      ${dateField('start', 'Date de l\'union', u.start_date, u.start_approx)}
      ${field('start_place', 'Lieu', u.start_place)}
      ${dateField('end', 'Date de fin', u.end_date, u.end_approx)}
    </div>
    <div class="mt-3">${field('notes', 'Notes', u.notes, { type: 'textarea' })}</div>`}
    <div class="mt-5">
      <p class="section-title mb-2">Enfants de cette union (${tu?.children.length ?? 0})</p>
      <div class="flex flex-wrap gap-2">${(tu?.children ?? []).map((c) => { const p = store.person(c.id); return `<span class="kid-chip">${avatarHtml(p, 'size-6')}${esc(firstName(p))}${c.relation !== 'biologique' ? ` <small>(${esc(CHILD_RELATIONS[c.relation].toLowerCase())})</small>` : ''}</span>`; }).join('') || '<span class="text-sm text-ink-soft">Aucun enfant enregistré.</span>'}</div>
    </div>`;
  if (!can.edit) [...form.elements].forEach((el) => (el.disabled = true));

  const m = openModal({
    title: solo ? 'Parent seul' : 'Union', subtitle: solo ? '' : esc(partners.map((p) => firstName(p)).join(' & ')),
    body: form, size: 'md',
    footer: `${can.delete ? `<button type="button" class="btn btn--ghost text-danger mr-auto" data-del>${icon('unlink', 'size-4')}Supprimer l'union</button>` : ''}
      ${can.add ? `<button type="button" class="btn btn--soft" data-child>${icon('baby', 'size-4')}Ajouter un enfant</button>` : ''}
      ${can.edit && !solo ? `<button type="button" class="btn btn--primary" data-save>${icon('check', 'size-4')}Enregistrer</button>` : ''}`,
  });
  wireDates(form);
  $('[data-save]', m.el)?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      await api('union.update', { body: { id: unionId, union: readForm(form) } });
      m.close();
      toast('Union mise à jour.');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  }));
  $('[data-child]', m.el)?.addEventListener('click', () => {
    m.close();
    onAddChild?.(partners[0]?.id, solo ? 'solo' : unionId);
  });
  $('[data-del]', m.el)?.addEventListener('click', async () => {
    const n = tu?.children.length ?? 0;
    const ok = await confirmDialog({
      title: 'Supprimer cette union ?', danger: true, confirm: 'Supprimer l\'union',
      message: `<p>Le lien entre <b>${esc(partners.map((p) => fullName(p)).join('</b> et <b>'))}</b> sera supprimé.</p>`,
      details: n ? `<p class="mt-2 text-sm">⚠️ ${n} enfant${n > 1 ? 's' : ''} perdront leur rattachement à cette union (les personnes ne sont pas supprimées).</p>` : '',
    });
    if (!ok) return;
    try {
      await api('union.delete', { body: { id: unionId } });
      m.close();
      toast('Union supprimée.');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------
//  Métier & événement
// ---------------------------------------------------------------------
export function openProfessionForm(personId, prof = {}, onSaved) {
  const form = document.createElement('form');
  form.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${field('title', 'Intitulé', prof.title, { required: true, cls: 'sm:col-span-2', placeholder: 'Instituteur, menuisier, infirmière…' })}
      ${field('employer', 'Employeur / entreprise', prof.employer)}
      ${field('place', 'Lieu', prof.place)}
      ${field('start_year', 'Année de début', prof.start_year, { type: 'number' })}
      ${field('end_year', 'Année de fin', prof.end_year, { type: 'number' })}
    </div><div class="mt-3">${field('description', 'Description', prof.description, { type: 'textarea' })}</div>`;
  const m = openModal({
    title: prof.id ? 'Modifier le métier' : 'Ajouter un métier', body: form,
    footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button><button type="button" class="btn btn--primary" data-save>${icon('check', 'size-4')}Enregistrer</button>`,
  });
  $('[data-save]', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      await api('profession.save', { body: { ...readForm(form), person_id: personId, id: prof.id ?? null } });
      m.close();
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

export function openEventForm(personId, ev = {}, onSaved) {
  const types = Object.fromEntries(Object.entries(EVENT_TYPES).map(([k, [l]]) => [k, l]));
  const form = document.createElement('form');
  form.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${select('type', 'Type', types, ev.type || 'autre')}
      ${field('title', 'Titre', ev.title, { required: true, placeholder: 'Obtention du baccalauréat…' })}
      ${dateField('event', 'Date', ev.event_date, ev.date_approx)}
      ${field('place', 'Lieu', ev.place)}
    </div><div class="mt-3">${field('description', 'Récit', ev.description, { type: 'textarea' })}</div>`;
  const m = openModal({
    title: ev.id ? 'Modifier l\'événement' : 'Ajouter un événement de vie', body: form,
    footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button><button type="button" class="btn btn--primary" data-save>${icon('check', 'size-4')}Enregistrer</button>`,
  });
  wireDates(form);
  $('[data-save]', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const d = readForm(form);
      d.date_approx = d.event_approx;
      await api('event.save', { body: { ...d, person_id: personId, id: ev.id ?? null } });
      m.close();
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

// ---------------------------------------------------------------------
//  Recadrage de portrait (glisser + zoom)  → Promise<Blob|null>
// ---------------------------------------------------------------------
export function openCropper(file) {
  return new Promise(async (resolve) => {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { toast('Image illisible.', 'error'); return resolve(null); }
    const SIZE = 320;
    const wrap = document.createElement('div');
    wrap.className = 'cropper';
    wrap.innerHTML = `<div class="cropper__stage"><canvas width="${SIZE * 2}" height="${SIZE * 2}"></canvas><div class="cropper__mask"></div></div>
      <label class="range-field mt-4"><span>${icon('zoom', 'size-4')} Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>
      <p class="text-xs text-ink-soft text-center mt-2">Faites glisser l'image pour centrer le visage.</p>`;
    const canvas = $('canvas', wrap);
    const ctx = canvas.getContext('2d');
    const range = $('input', wrap);
    const base = Math.max(SIZE * 2 / bmp.width, SIZE * 2 / bmp.height);
    let z = 1;
    let off = { x: 0, y: 0 };
    const clamp = () => {
      const w = bmp.width * base * z;
      const h = bmp.height * base * z;
      off.x = Math.min(0, Math.max(SIZE * 2 - w, off.x));
      off.y = Math.min(0, Math.max(SIZE * 2 - h, off.y));
    };
    const center = () => {
      off = { x: (SIZE * 2 - bmp.width * base * z) / 2, y: (SIZE * 2 - bmp.height * base * z) / 2 * (bmp.height > bmp.width ? 0.5 : 1) };
      clamp();
    };
    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, off.x, off.y, bmp.width * base * z, bmp.height * base * z);
    };
    center();
    draw();
    range.addEventListener('input', () => {
      const c = { x: SIZE - off.x, y: SIZE - off.y };
      const nz = parseFloat(range.value);
      off.x = SIZE - (c.x * nz) / z;
      off.y = SIZE - (c.y * nz) / z;
      z = nz;
      clamp();
      draw();
    });
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      const f = canvas.width / r.width;
      off.x += (e.clientX - drag.x) * f;
      off.y += (e.clientY - drag.y) * f;
      drag = { x: e.clientX, y: e.clientY };
      clamp();
      draw();
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      range.value = Math.max(1, Math.min(4, z * Math.exp(-e.deltaY * 0.002)));
      range.dispatchEvent(new Event('input'));
    }, { passive: false });

    let result = null;
    const m = openModal({
      title: 'Recadrer la photo', body: wrap, size: 'sm',
      footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button><button type="button" class="btn btn--primary" data-ok>${icon('check', 'size-4')}Valider</button>`,
      onClose: () => resolve(result),
    });
    $('[data-ok]', m.el).addEventListener('click', () => {
      const out = document.createElement('canvas');
      out.width = out.height = 800;
      const o = out.getContext('2d');
      const ratio = 800 / (SIZE * 2);
      o.drawImage(bmp, off.x * ratio, off.y * ratio, bmp.width * base * z * ratio, bmp.height * base * z * ratio);
      out.toBlob((b) => { result = b; m.close(); }, 'image/jpeg', 0.9);
    });
  });
}

/** Redimensionne une image côté navigateur avant envoi (galerie) */
export async function resizeImage(file, max = 1800) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
}

export { genderize };
