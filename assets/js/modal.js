// =====================================================================
//  Fenêtres modales, confirmations, menus contextuels
// =====================================================================
import { esc, icon, html } from './core.js';

const stack = [];

/**
 * Ouvre une fenêtre. `body` : chaîne HTML ou élément.
 * Retourne { el, body, close }.
 */
export function openModal({ title, subtitle = '', body = '', size = 'md', footer = '', onClose, className = '' }) {
  const root = document.getElementById('modal-root') || document.body;
  const lastFocus = document.activeElement;
  const el = html(`
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="mt-${stack.length}">
      <div class="modal__backdrop" data-close></div>
      <div class="modal__box modal__box--${size}">
        <header class="modal__head">
          <div class="min-w-0">
            <h2 class="modal__title" id="mt-${stack.length}">${title}</h2>
            ${subtitle ? `<p class="modal__subtitle">${subtitle}</p>` : ''}
          </div>
          <button type="button" class="icon-btn icon-btn--ghost shrink-0" data-close aria-label="Fermer">${icon('x', 'size-5')}</button>
        </header>
        <div class="modal__body"></div>
        ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
      </div>
    </div>`);
  const bodyEl = el.querySelector('.modal__body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-open'));

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    el.classList.remove('is-open');
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), 260);
    stack.splice(stack.indexOf(api), 1);
    onClose?.(result);
    if (lastFocus?.focus) lastFocus.focus({ preventScroll: true });
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') trapFocus(e, el);
  });

  const api = { el, body: bodyEl, close };
  stack.push(api);
  setTimeout(() => {
    const first = el.querySelector('[autofocus]') || el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
    (first || el.querySelector('.modal__box')).focus?.({ preventScroll: true });
  }, 60);
  return api;
}

export function topModal() {
  return stack[stack.length - 1] ?? null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) {
    e.stopPropagation();
    stack[stack.length - 1].close();
  }
}, true);

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Confirmation : Promise<boolean> */
export function confirmDialog({ title, message, confirm = 'Confirmer', danger = false, details = '' }) {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: esc(title),
      size: 'sm',
      className: 'modal--confirm',
      body: `<div class="confirm ${danger ? 'confirm--danger' : ''}">
          <div class="confirm__icon">${icon(danger ? 'trash' : 'info', 'size-6')}</div>
          <div class="confirm__text">${message}${details}</div>
        </div>`,
      footer: `<button type="button" class="btn btn--ghost" data-close>Annuler</button>
               <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok autofocus>${esc(confirm)}</button>`,
      onClose: () => resolve(ok),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; m.close(); });
    setTimeout(() => m.el.querySelector('[data-ok]')?.focus(), 80);
  });
}

/** Petit menu flottant ancré à un élément */
export function popMenu(anchor, items) {
  document.querySelectorAll('.floating-menu').forEach((n) => n.remove());
  const menu = html(`<div class="floating-menu menu" role="menu"></div>`);
  for (const it of items) {
    if (it === '-') { menu.append(html('<div class="menu__sep"></div>')); continue; }
    const b = html(`<button type="button" class="menu__item ${it.danger ? 'text-danger' : ''}" role="menuitem">${it.icon ? icon(it.icon, 'size-4 opacity-70') : ''}<span>${esc(it.label)}</span></button>`);
    b.addEventListener('click', () => { menu.remove(); it.action(); });
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let x = r.left + r.width / 2 - mw / 2;
  let y = r.bottom + 8;
  if (y + mh > innerHeight - 8) y = r.top - mh - 8;
  x = Math.max(8, Math.min(innerWidth - mw - 8, x));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  requestAnimationFrame(() => menu.classList.add('is-open'));
  const off = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off, true); }
  };
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  return menu;
}
