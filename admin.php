<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';
require APP_DIR . '/views/layout.php';

Auth::requireLogin();
if (!Auth::isAdmin()) {
    http_response_code(403);
    redirect('index.php');
}
$family = Settings::get('family_name', 'Notre famille');

layout_head('Administration — ' . $family, 'admin-page');
?>
<header class="topbar">
  <a href="index.php" class="topbar__brand">
    <img src="assets/img/favicon.svg" alt="" class="size-9 rounded-xl">
    <span>
      <span class="block text-[10px] uppercase tracking-[0.28em] text-ink-soft leading-none">Administration</span>
      <span class="block font-display text-lg font-semibold leading-tight truncate max-w-[14rem]" data-family-name><?= e($family) ?></span>
    </span>
  </a>
  <div class="flex items-center gap-2">
    <a href="index.php" class="btn btn--soft">
      <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>
      <span class="hidden sm:inline">Retour à l'arbre</span>
    </a>
    <?= theme_toggle() ?>
  </div>
</header>

<main class="admin">
  <div class="admin__head">
    <div>
      <h1 class="font-display text-3xl sm:text-4xl font-semibold">Gestion de l'arbre</h1>
      <p class="text-ink-soft mt-1">Comptes, permissions, corbeille et historique des modifications.</p>
    </div>
    <div class="admin__stats" data-stats></div>
  </div>

  <nav class="tabs tabs--pill mb-6" role="tablist">
    <button type="button" class="tab is-active" data-tab="users">Utilisateurs</button>
    <button type="button" class="tab" data-tab="trash">Corbeille <span class="tab__count" data-count="trash"></span></button>
    <button type="button" class="tab" data-tab="log">Journal</button>
    <button type="button" class="tab" data-tab="settings">Réglages</button>
  </nav>

  <section data-pane="users"></section>
  <section data-pane="trash" class="hidden"></section>
  <section data-pane="log" class="hidden"></section>
  <section data-pane="settings" class="hidden"></section>
</main>

<div id="modal-root"></div>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="tooltip" class="tooltip" role="tooltip"></div>
<?php layout_foot(['assets/js/admin.js']);
