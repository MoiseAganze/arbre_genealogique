<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';
require APP_DIR . '/views/layout.php';

if (Auth::check()) {
    redirect('index.php');
}

$error = null;
$username = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    if (!csrf_check($_POST['csrf'] ?? null)) {
        $error = 'Session expirée, veuillez réessayer.';
    } elseif (Auth::attempt($username, (string) ($_POST['password'] ?? ''))) {
        redirect('index.php');
    } else {
        $error = 'Identifiant ou mot de passe incorrect.';
    }
}

$family = Settings::get('family_name', 'Notre famille');
layout_head('Connexion — ' . $family, 'auth-page');
?>
<main class="auth-shell">
  <div class="absolute top-5 right-5"><?= theme_toggle() ?></div>
  <div class="auth-card">
    <div class="text-center mb-8">
      <div class="auth-emblem">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M32 50V30M32 30 18 19M32 30l14-11M18 19v-5M46 19v-5" />
          <circle cx="32" cy="52" r="5" fill="currentColor"/><circle cx="18" cy="12" r="4.5" fill="currentColor"/><circle cx="46" cy="12" r="4.5" fill="currentColor"/><circle cx="32" cy="30" r="3" fill="currentColor"/>
        </svg>
      </div>
      <p class="text-xs uppercase tracking-[0.3em] text-ink-soft mb-2">Arbre généalogique</p>
      <h1 class="font-display text-3xl font-semibold"><?= e($family) ?></h1>
    </div>

    <?php if ($error): ?><div class="alert alert--error mb-5"><?= e($error) ?></div><?php endif; ?>

    <form method="post" class="space-y-4">
      <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
      <label class="field"><span>Identifiant</span><input name="username" value="<?= e($username) ?>" autocomplete="username" required autofocus></label>
      <label class="field"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn--primary w-full justify-center py-3 text-base mt-2">Entrer dans l'arbre</button>
    </form>
    <?php if (Auth::publicView()): ?>
      <a href="index.php" class="btn btn--ghost w-full justify-center mt-3">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        Voir l'arbre sans me connecter
      </a>
    <?php endif; ?>
    <p class="text-center text-xs text-ink-soft mt-6">La connexion n'est utile que pour ajouter ou modifier des membres.<br>Pas de compte ? Demandez à l'administrateur de la famille.</p>
  </div>
</main>
<?php layout_foot(['assets/js/auth.js']);
