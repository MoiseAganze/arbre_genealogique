// =====================================================================
//  Bascule clair / sombre avec révélation circulaire
// =====================================================================
import { initSky } from './background.js';

export function initTheme() {
  const sky = initSky();
  const root = document.documentElement;

  const apply = (theme) => {
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    try { localStorage.setItem('arbre-theme', theme); } catch { /* */ }
    sky?.setTheme(theme === 'dark');
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(next);
      return;
    }
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    document.startViewTransition(() => apply(next));
  });

  // Suit le système si l'utilisateur n'a jamais choisi
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem('arbre-theme'); } catch { /* */ }
    if (!saved) apply(e.matches ? 'dark' : 'light');
  });
}
