<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';
require APP_DIR . '/views/layout.php';

if (app_installed()) {
    redirect('index.php');
}

$errors = [];
$old = [
    'db_host' => '127.0.0.1', 'db_port' => '3306', 'db_name' => 'arbre_famille', 'db_user' => 'root',
    'family_name' => 'Famille ', 'admin_user' => 'admin', 'admin_name' => 'Administrateur', 'demo' => '1',
];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $old = array_merge($old, array_map(fn ($v) => is_string($v) ? trim($v) : $v, $_POST));
    if (!csrf_check($_POST['csrf'] ?? null)) {
        $errors[] = 'Jeton de sécurité invalide, rechargez la page.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $old['db_name'])) {
        $errors[] = 'Nom de base invalide (lettres, chiffres et _ uniquement).';
    }
    if (!preg_match('/^[a-zA-Z0-9._-]{3,60}$/', $old['admin_user'])) {
        $errors[] = 'Identifiant administrateur invalide.';
    }
    if (mb_strlen($_POST['admin_pass'] ?? '') < 8) {
        $errors[] = 'Le mot de passe administrateur doit contenir au moins 8 caractères.';
    }
    if (($_POST['admin_pass'] ?? '') !== ($_POST['admin_pass2'] ?? '')) {
        $errors[] = 'Les deux mots de passe ne correspondent pas.';
    }
    if (!is_writable(APP_DIR)) {
        $errors[] = 'Le dossier « app/ » doit être accessible en écriture pour créer config.php.';
    }

    if (!$errors) {
        $cfg = [
            'db_host' => $old['db_host'],
            'db_port' => (int) $old['db_port'],
            'db_name' => $old['db_name'],
            'db_user' => $old['db_user'],
            'db_pass' => $_POST['db_pass'] ?? '',
            'debug'   => false,
        ];
        try {
            $server = Database::connect($cfg, false);
            try {
                $server->exec("CREATE DATABASE IF NOT EXISTS `{$cfg['db_name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            } catch (PDOException) {
                // L'utilisateur n'a peut-être pas le droit de créer une base : on tente quand même la connexion.
            }
            $pdo = Database::connect($cfg);
            $schema = file_get_contents(APP_ROOT . '/database/schema.sql');
            $schema = preg_replace('/^\s*--.*$/m', '', $schema);
            foreach (preg_split('/;\s*(\r?\n|$)/', $schema) as $sql) {
                if (trim($sql) !== '') {
                    $pdo->exec($sql);
                }
            }

            $pdo->prepare('INSERT INTO users (username, display_name, password_hash, role, can_add, can_edit, can_delete) VALUES (?,?,?,"admin",1,1,1)')
                ->execute([$old['admin_user'], $old['admin_name'] ?: 'Administrateur', password_hash($_POST['admin_pass'], PASSWORD_DEFAULT)]);
            $adminId = (int) $pdo->lastInsertId();

            $set = $pdo->prepare('INSERT INTO settings (name, value) VALUES (?, ?)');
            $set->execute(['family_name', mb_substr($old['family_name'] ?: 'Notre famille', 0, 120)]);

            if (!empty($_POST['demo'])) {
                $seed = require APP_ROOT . '/database/demo.php';
                $root = $seed($pdo);
                $set->execute(['root_person_id', (string) $root]);
            }

            $export = "<?php\n// Généré par install.php le " . date('Y-m-d H:i') . "\nreturn " . var_export($cfg, true) . ";\n";
            if (file_put_contents(CONFIG_FILE, $export) === false) {
                throw new RuntimeException('Impossible d\'écrire app/config.php.');
            }
            @chmod(CONFIG_FILE, 0640);
            $_SESSION['user_id'] = $adminId;
            session_regenerate_id(true);
            redirect('index.php');
        } catch (Throwable $e) {
            $errors[] = 'Erreur : ' . $e->getMessage();
        }
    }
}

layout_head('Installation — Arbre de famille', 'auth-page');
?>
<main class="auth-shell">
  <div class="auth-card auth-card--wide">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <img src="assets/img/favicon.svg" alt="" class="size-11 rounded-2xl shadow-lg">
        <div>
          <h1 class="font-display text-2xl font-semibold">Installation</h1>
          <p class="text-sm text-ink-soft">Quelques informations pour démarrer votre arbre.</p>
        </div>
      </div>
      <?= theme_toggle() ?>
    </div>

    <?php if ($errors): ?>
      <div class="alert alert--error mb-5"><?php foreach ($errors as $err): ?><p><?= e($err) ?></p><?php endforeach; ?></div>
    <?php endif; ?>

    <form method="post" class="space-y-6" autocomplete="off">
      <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">

      <fieldset class="space-y-3">
        <legend class="section-title">1 · Base de données MySQL</legend>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="field sm:col-span-2"><span>Serveur</span><input name="db_host" value="<?= e($old['db_host']) ?>" required></label>
          <label class="field"><span>Port</span><input name="db_port" type="number" value="<?= e($old['db_port']) ?>" required></label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="field"><span>Nom de la base</span><input name="db_name" value="<?= e($old['db_name']) ?>" required></label>
          <label class="field"><span>Utilisateur</span><input name="db_user" value="<?= e($old['db_user']) ?>" required></label>
          <label class="field"><span>Mot de passe</span><input name="db_pass" type="password"></label>
        </div>
      </fieldset>

      <fieldset class="space-y-3">
        <legend class="section-title">2 · Votre famille</legend>
        <label class="field"><span>Nom de l'arbre</span><input name="family_name" value="<?= e($old['family_name']) ?>" placeholder="Famille Dupont" required></label>
        <label class="check"><input type="checkbox" name="demo" value="1" <?= !empty($old['demo']) ? 'checked' : '' ?>><span>Charger une famille de démonstration (vous pourrez la supprimer)</span></label>
      </fieldset>

      <fieldset class="space-y-3">
        <legend class="section-title">3 · Compte administrateur</legend>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="field"><span>Identifiant</span><input name="admin_user" value="<?= e($old['admin_user']) ?>" required></label>
          <label class="field"><span>Nom affiché</span><input name="admin_name" value="<?= e($old['admin_name']) ?>" required></label>
          <label class="field"><span>Mot de passe (8 caractères min.)</span><input name="admin_pass" type="password" minlength="8" required></label>
          <label class="field"><span>Confirmation</span><input name="admin_pass2" type="password" minlength="8" required></label>
        </div>
      </fieldset>

      <button class="btn btn--primary w-full justify-center py-3 text-base">Créer mon arbre</button>
    </form>
  </div>
</main>
<?php layout_foot(['assets/js/auth.js']);
