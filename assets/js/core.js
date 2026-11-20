// =====================================================================
//  Outils communs : API, échappement, dates, icônes, notifications
// =====================================================================

export const CSRF = document.querySelector('meta[name="csrf-token"]')?.content ?? '';

/** Appel à l'API. `body` objet → JSON ; FormData → multipart. */
export async function api(action, { body = null, method = body ? 'POST' : 'GET', params = {} } = {}) {
  const url = new URL('api.php', location.href);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const opts = { method, headers: { 'X-CSRF-Token': CSRF, Accept: 'application/json' }, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Connexion au serveur impossible.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (res.status === 401) {
    location.href = 'login.php';
    throw new Error('Session expirée.');
  }
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------
//  Texte
// ---------------------------------------------------------------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Texte multi-lignes → paragraphes HTML sûrs */
export const paragraphs = (s) =>
  esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

export const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// ---------------------------------------------------------------------
//  Personnes
// ---------------------------------------------------------------------
/** Nom complet : Prénom(s) Nom Postnom */
export const fullName = (p) => [p?.first_names, p?.last_name, p?.postnom].filter(Boolean).join(' ') || 'Sans nom';
export const firstName = (p) => (p?.first_names || '').split(/\s+/)[0] || 'Sans nom';

export function initials(p) {
  const a = (p?.first_names || '?').trim()[0] || '?';
  const b = (p?.last_name || '').trim()[0] || '';
  return (a + b).toUpperCase();
}

/** Teinte stable déduite de l'identifiant */
export function hue(id) {
  return (Number(id) * 137.508) % 360;
}

export function avatarHtml(p, cls = '') {
  if (p?.photo) {
    return `<img class="avatar ${cls}" src="${esc(p.photo)}" alt="" loading="lazy" draggable="false">`;
  }
  const h = hue(p?.id ?? 0);
  return `<span class="avatar avatar--initials ${cls}" style="--h:${h}">${esc(initials(p))}</span>`;
}

export const genderize = (p, m, f, u = m) => (p?.gender === 'F' ? f : p?.gender === 'M' ? m : u);

// ---------------------------------------------------------------------
//  Dates partielles « AAAA », « AAAA-MM », « AAAA-MM-JJ »
// ---------------------------------------------------------------------
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map((n) => parseInt(n, 10));
  if (!y) return null;
  return { y, m: m || null, d: d || null };
}

export function formatDate(s, approx = false, { short = false } = {}) {
  const p = parseDate(s);
  if (!p) return '';
  let out;
  if (p.d && p.m) out = `${p.d === 1 ? '1er' : p.d} ${(short ? MONTHS_SHORT : MONTHS)[p.m - 1]} ${p.y}`;
  else if (p.m) out = `${(short ? MONTHS_SHORT : MONTHS)[p.m - 1]} ${p.y}`;
  else out = String(p.y);
  return approx ? `vers ${out}` : out;
}

export const year = (s) => parseDate(s)?.y ?? null;

/** Âge actuel (vivant) ou âge au décès */
export function age(p) {
  const b = parseDate(p?.birth_date);
  if (!b) return null;
  let end;
  if (p.is_living) {
    const now = new Date();
    end = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  } else {
    end = parseDate(p.death_date);
    if (!end) return null;
  }
  let a = end.y - b.y;
  if (b.m && end.m && (end.m < b.m || (end.m === b.m && b.d && end.d && end.d < b.d))) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** Libellé court des années : « 1910 – 1985 », « ° 1985 » */
export function lifespan(p) {
  const b = year(p.birth_date);
  const d = year(p.death_date);
  const bs = b ? `${p.birth_approx ? '~' : ''}${b}` : '';
  const ds = d ? `${p.death_approx ? '~' : ''}${d}` : '';
  if (!p.is_living) {
    if (bs || ds) return `${bs || '?'} – ${ds || '?'}`;
    return '†';
  }
  return bs ? `° ${bs}` : '';
}

/** Date de saisie (champ texte libre) → date partielle ISO */
export function parseInputDate(str) {
  const s = String(str ?? '').trim();
  if (!s) return { value: '', approx: false, ok: true };
  let approx = /^(vers|env\.?|environ|~|ca\.?|circa)\s*/i.test(s);
  const t = s.replace(/^(vers|env\.?|environ|~|ca\.?|circa)\s*/i, '').trim();
  let m;
  if ((m = t.match(/^(\d{4})$/))) return { value: m[1], approx, ok: true };
  if ((m = t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return { value: [m[1], m[2].padStart(2, '0'), m[3]?.padStart(2, '0')].filter(Boolean).join('-'), approx, ok: true };
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return { value: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, approx, ok: valid(+m[3], +m[2], +m[1]) };
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{4})$/))) return { value: `${m[2]}-${m[1].padStart(2, '0')}`, approx, ok: +m[1] >= 1 && +m[1] <= 12 };
  // « 14 mars 1923 », « mars 1923 »
  const n = normalize(t).replace(/1er/, '1');
  const month = MONTHS.findIndex((mo) => n.includes(normalize(mo).slice(0, 4)));
  if ((m = n.match(/(?:(\d{1,2})\s+)?[a-z.]+\s+(\d{4})/)) && month >= 0) {
    const mm = String(month + 1).padStart(2, '0');
    return { value: m[1] ? `${m[2]}-${mm}-${m[1].padStart(2, '0')}` : `${m[2]}-${mm}`, approx, ok: !m[1] || valid(+m[2], month + 1, +m[1]) };
  }
  return { value: '', approx, ok: false };
}

function valid(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** Date ISO partielle → texte de saisie lisible (JJ/MM/AAAA) */
export function toInputDate(s, approx) {
  const p = parseDate(s);
  if (!p) return '';
  let out = p.d ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : p.m ? `${String(p.m).padStart(2, '0')}/${p.y}` : String(p.y);
  return approx ? `vers ${out}` : out;
}

// ---------------------------------------------------------------------
//  Libellés
// ---------------------------------------------------------------------
export const UNION_TYPES = {
  mariage: 'Mariage', pacs: 'PACS', union_libre: 'Union libre', fiancailles: 'Fiançailles',
  religieux: 'Mariage religieux', coutumier: 'Mariage coutumier', inconnu: 'Union',
};
export const UNION_STATUSES = {
  en_cours: 'En cours', divorce: 'Divorce', separe: 'Séparation', veuvage: 'Fin par décès', annule: 'Annulée',
};
export const CHILD_RELATIONS = { biologique: 'Biologique', adoptif: 'Adoptif', accueil: 'Accueil / tutelle', inconnu: 'Inconnu' };

export const EVENT_TYPES = {
  naissance: ['Naissance', 'baby'], bapteme: ['Baptême', 'drop'], etudes: ['Études', 'book'], diplome: ['Diplôme', 'cap'],
  travail: ['Travail', 'briefcase'], demenagement: ['Déménagement', 'home'], militaire: ['Service militaire', 'shield'],
  voyage: ['Voyage', 'plane'], distinction: ['Distinction', 'award'], sante: ['Santé', 'heart'],
  religion: ['Religion', 'sparkle'], deces: ['Décès', 'cross'], autre: ['Autre', 'dot'],
};

/** Palette des unions (couleurs par numéro d'union) */
export const UNION_COLORS = ['var(--u1)', 'var(--u2)', 'var(--u3)', 'var(--u4)', 'var(--u5)'];

// ---------------------------------------------------------------------
//  Icônes (traits 24×24)
// ---------------------------------------------------------------------
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9Z"/>',
  rings: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="m9 4 2 3M15 4l-2 3"/>',
  baby: '<circle cx="12" cy="7" r="3.5"/><path d="M8 21v-5l-3-3M16 21v-5l3-3M8 13h8"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-1 .2M20 4v14h-7"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  home: '<path d="M3 11 12 4l9 7M5 10v10h14V10"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  plane: '<path d="M10 14 3 11l2-2 6 1 5-5c1-1 3-1 3 0s0 2-1 3l-5 5 1 6-2 2-3-7-4 3v2l-2 1-1-3-3-1 1-2h2z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  cross: '<path d="M12 3v18M7 8h10"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7M3 3l18 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  phone: '<path d="M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  quote: '<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>',
  tree: '<path d="M12 21v-7M12 14l-5-4M12 14l5-4M7 10V6M17 10V6"/><circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/>',
  focus: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

export function icon(name, cls = 'size-4') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.dot}</svg>`;
}

// ---------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------
export function toast(message, type = 'success', ms = 3600) {
  const root = document.getElementById('toasts');
  if (!root) return alert(message);
  const el = html(`<div class="toast toast--${type}" role="status">
      <span class="toast__icon">${icon(type === 'error' ? 'x' : type === 'info' ? 'info' : 'check', 'size-4')}</span>
      <span>${esc(message)}</span></div>`);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 400);
  }, ms);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
