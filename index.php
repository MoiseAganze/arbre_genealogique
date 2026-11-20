<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';
require APP_DIR . '/views/layout.php';

// Consultation libre (lecture seule) si l'arbre est public ; sinon connexion obligatoire
if (!Auth::canView()) {
    redirect('login.php');
}
$me = Auth::user();
$family = Settings::get('family_name', 'Notre famille');

layout_head($family . ' — Arbre généalogique', 'app-page');
?>
<!-- ================= Barre supérieure ================= -->
<header class="topbar">
  <a href="index.php" class="topbar__brand" title="<?= e($family) ?>">
    <img src="assets/img/favicon.svg" alt="" class="size-9 rounded-xl">
    <span class="hidden md:block">
      <span class="block text-[10px] uppercase tracking-[0.28em] text-ink-soft leading-none">Arbre de la</span>
      <span class="block font-display text-lg font-semibold leading-tight truncate max-w-[16rem]" data-family-name><?= e($family) ?></span>
    </span>
  </a>

  <button type="button" class="searchbar" data-action="search" aria-label="Rechercher une personne">
    <svg viewBox="0 0 24 24" class="size-4.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <span class="truncate">Rechercher un membre…</span>
    <kbd class="ml-auto hidden sm:inline-flex">Ctrl K</kbd>
  </button>

  <div class="flex items-center gap-1.5">
    <button type="button" class="icon-btn <?= $me ? 'hidden sm:inline-flex' : 'hidden min-[420px]:inline-flex' ?>" data-action="kinship" title="Calculer un lien de parenté">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 8.5 15.5 15.5M18 6h.01M6 18h.01"/></svg>
    </button>
    <button type="button" class="icon-btn <?= $me ? 'hidden sm:inline-flex' : 'hidden min-[420px]:inline-flex' ?>" data-action="calendar" title="Anniversaires et souvenirs">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
    </button>
    <button type="button" class="icon-btn <?= $me ? 'hidden sm:inline-flex' : 'hidden min-[420px]:inline-flex' ?>" data-action="stats" title="Statistiques de la famille">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
    </button>
    <?= theme_toggle() ?>
    <?php if (!$me): ?>
      <span class="guest-badge hidden lg:inline-flex" title="Vous consultez l'arbre sans compte : rien ne peut être modifié">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        Lecture seule
      </span>
      <a href="login.php" class="btn btn--primary btn--sm ml-1">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        <span class="hidden sm:inline">Se connecter</span>
      </a>
    <?php else: ?>
    <div class="relative">
      <button type="button" class="avatar-btn" data-action="user-menu" aria-haspopup="menu" title="<?= e($me['display_name']) ?>">
        <?= e(mb_strtoupper(mb_substr($me['display_name'], 0, 1))) ?>
      </button>
      <div class="menu hidden" data-menu="user" role="menu">
        <div class="px-3 py-2 border-b border-line mb-1">
          <p class="font-medium truncate"><?= e($me['display_name']) ?></p>
          <p class="text-xs text-ink-soft"><?= $me['role'] === 'admin' ? 'Administrateur' : 'Membre' ?></p>
        </div>
        <button type="button" class="menu__item sm:hidden" data-action="kinship">Lien de parenté</button>
        <button type="button" class="menu__item sm:hidden" data-action="calendar">Anniversaires</button>
        <button type="button" class="menu__item sm:hidden" data-action="stats">Statistiques</button>
        <?php if ($me['role'] === 'admin'): ?>
          <a class="menu__item" href="admin.php">Administration</a>
        <?php endif; ?>
        <button type="button" class="menu__item" data-action="shortcuts">Raccourcis clavier</button>
        <button type="button" class="menu__item" data-action="password">Changer mon mot de passe</button>
        <form method="post" action="logout.php">
          <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
          <button class="menu__item text-danger">Se déconnecter</button>
        </form>
      </div>
    </div>
    <?php endif; ?>
  </div>
</header>

<!-- ================= Zone de l'arbre ================= -->
<main id="viewport" class="viewport" tabindex="0" aria-label="Arbre généalogique">
  <div id="world" class="world">
    <svg id="links" class="links" aria-hidden="true"></svg>
    <div id="nodes" class="nodes"></div>
  </div>
</main>

<!-- État vide -->
<section id="empty-state" class="empty-state hidden">
  <div class="empty-state__card">
    <div class="empty-state__orb"></div>
    <h2 class="font-display text-3xl font-semibold mb-2">Votre arbre commence ici</h2>
    <p class="text-ink-soft mb-6 max-w-sm mx-auto">Ajoutez une première personne — vous, un parent ou l'ancêtre le plus lointain que vous connaissez. Le reste de la famille viendra s'y accrocher.</p>
    <button type="button" class="btn btn--primary text-base px-6 py-3" data-action="add-first">
      <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Ajouter la première personne
    </button>
  </div>
</section>

<!-- Barre d'outils de navigation -->
<nav class="toolbar" aria-label="Navigation dans l'arbre">
  <button type="button" class="tool" data-action="zoom-in" title="Zoomer (+)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
  <button type="button" class="tool" data-action="zoom-out" title="Dézoomer (−)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
  <button type="button" class="tool" data-action="fit" title="Tout afficher (F)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg></button>
  <button type="button" class="tool" data-action="center" title="Recentrer sur la personne au centre (C)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
  <button type="button" class="tool" data-action="home" title="Revenir à la racine de l'arbre (H)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11 12 4l9 7M5 10v10h14V10"/></svg></button>
  <button type="button" class="tool" data-action="me" title="Aller à ma fiche (M)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></button>
  <span class="toolbar__sep"></span>
  <button type="button" class="tool" data-action="depth" title="Générations affichées"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5"/></svg></button>
  <button type="button" class="tool" data-action="legend" title="Légende"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg></button>
</nav>

<!-- Réglage des générations -->
<div class="popover hidden" data-popover="depth">
  <p class="section-title mb-3">Générations affichées</p>
  <label class="range-field"><span>Ascendants <b data-out="up">3</b></span><input type="range" min="0" max="8" value="3" data-depth="up"></label>
  <label class="range-field"><span>Descendants <b data-out="down">4</b></span><input type="range" min="0" max="10" value="4" data-depth="down"></label>
  <label class="check mt-2"><input type="checkbox" data-opt="siblings" checked><span>Afficher les frères et sœurs</span></label>
  <label class="check"><input type="checkbox" data-opt="compact"><span>Cartes compactes</span></label>
</div>

<!-- Légende -->
<div class="popover popover--legend hidden" data-popover="legend">
  <p class="section-title mb-3">Légende</p>
  <ul class="legend">
    <li><span class="legend__card legend__card--alive"></span>Personne vivante</li>
    <li><span class="legend__card legend__card--dead"></span>Personne décédée (photo en noir et blanc, †)</li>
    <li><svg width="44" height="14"><line x1="2" y1="7" x2="42" y2="7" class="lg-line"/><circle cx="22" cy="7" r="5" class="lg-node"/></svg>Union en cours</li>
    <li><svg width="44" height="14"><line x1="2" y1="7" x2="42" y2="7" class="lg-line" stroke-dasharray="5 4"/><circle cx="22" cy="7" r="5" class="lg-node"/></svg>Divorce / séparation</li>
    <li><svg width="44" height="14"><line x1="2" y1="7" x2="42" y2="7" class="lg-line" opacity=".45"/><circle cx="22" cy="7" r="5" class="lg-node" opacity=".6"/></svg>Union terminée par un décès</li>
    <li><svg width="44" height="14"><line x1="22" y1="0" x2="22" y2="14" class="lg-line" stroke-dasharray="2 3"/></svg>Enfant adopté / accueilli</li>
    <li><span class="legend__num">2</span>Numéro de l'union (remariage)</li>
  </ul>
  <p class="text-xs text-ink-soft mt-3 leading-relaxed">Glissez pour vous déplacer, molette ou pincement pour zoomer. Double-cliquez sur une personne pour la placer au centre.</p>
</div>

<!-- Fil d'Ariane des personnes visitées -->
<div id="trail" class="trail" aria-label="Personnes visitées"></div>

<!-- Mini-carte -->
<div class="minimap" id="minimap-wrap" title="Mini-carte : cliquez pour vous déplacer">
  <canvas id="minimap" width="200" height="130"></canvas>
</div>

<!-- Panneau de détail -->
<aside id="panel" class="panel" aria-hidden="true" aria-label="Fiche de la personne"></aside>

<div id="modal-root"></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="tooltip" class="tooltip" role="tooltip"></div>

<?php layout_foot(['assets/js/app.js']);
