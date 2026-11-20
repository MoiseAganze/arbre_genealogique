<?php
declare(strict_types=1);

/** En-tête HTML commun : polices, thème (appliqué avant l'affichage), styles. */
function layout_head(string $title, string $bodyClass = ''): void
{
    ?><!doctype html>
<html lang="fr" class="h-full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($title) ?></title>
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="<?= e(asset('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script>
  // Thème appliqué immédiatement pour éviter le flash
  (function () {
    var t = null;
    try { t = localStorage.getItem('arbre-theme'); } catch (e) {}
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.dataset.theme = t;
  })();
</script>
<link rel="stylesheet" href="<?= e(asset('assets/css/app.css')) ?>">
</head>
<?php // Seule la page de l'arbre bloque le défilement (l'arbre gère son propre déplacement) ?>
<body class="font-sans text-ink antialiased <?= str_contains($bodyClass, 'app-page') ? 'h-full overflow-hidden' : 'min-h-full' ?> <?= e($bodyClass) ?>">
<canvas id="sky" aria-hidden="true"></canvas>
<?php
}

function layout_foot(array $scripts = []): void
{
    foreach ($scripts as $src) {
        echo '<script type="module" src="' . e(asset($src)) . '"></script>' . "\n";
    }
    echo "</body>\n</html>\n";
}

/** Bouton de bascule de thème */
function theme_toggle(string $extra = ''): string
{
    return '<button type="button" class="theme-toggle ' . e($extra) . '" data-theme-toggle aria-label="Changer de thème" title="Thème clair / sombre">
      <span class="theme-toggle__track"><span class="theme-toggle__thumb">
        <svg class="theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      </span></span>
    </button>';
}
