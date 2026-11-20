<?php
declare(strict_types=1);

/**
 * Point d'entrée commun : configuration, session, chargement des classes.
 */

define('APP_ROOT', dirname(__DIR__));
define('APP_DIR', __DIR__);
define('UPLOAD_DIR', APP_ROOT . '/uploads');
define('CONFIG_FILE', APP_DIR . '/config.php');

mb_internal_encoding('UTF-8');
date_default_timezone_set('Europe/Paris');

spl_autoload_register(function (string $class): void {
    $file = APP_DIR . '/classes/' . $class . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require APP_DIR . '/helpers.php';

/** L'application est-elle installée ? */
function app_installed(): bool
{
    return is_file(CONFIG_FILE);
}

/** Configuration (tableau) */
function config(?string $key = null, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $config = app_installed() ? require CONFIG_FILE : [];
    }
    if ($key === null) {
        return $config;
    }
    return $config[$key] ?? $default;
}

// ---------------------------------------------------------------------
// Session sécurisée
// ---------------------------------------------------------------------
if (session_status() !== PHP_SESSION_ACTIVE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('arbre_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// En-têtes de sécurité de base
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

$currentScript = basename($_SERVER['SCRIPT_NAME'] ?? '');
if (!app_installed() && $currentScript !== 'install.php') {
    if (is_file(APP_ROOT . '/install.php')) {
        header('Location: install.php');
        exit;
    }
    // Installation manuelle : config.php pas encore créé
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Configuration manquante</title>'
        . '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.6;color:#1e293b">'
        . '<h1 style="font-size:1.4rem">Configuration manquante</h1>'
        . '<p>Le fichier <code>app/config.php</code> est introuvable.</p>'
        . '<ol><li>Copiez <code>app/config.sample.php</code> sous le nom <code>app/config.php</code>.</li>'
        . '<li>Renseignez-y le nom de la base, l\'utilisateur MySQL et son mot de passe.</li>'
        . '<li>Importez <code>database/install-cpanel.sql</code> dans phpMyAdmin.</li></ol>'
        . '<p>Le guide complet se trouve dans <code>DEPLOIEMENT-CPANEL.md</code>.</p></body>';
    exit;
}

// Connexion impossible à la base : message lisible plutôt qu'une page blanche
if (app_installed() && $currentScript !== 'install.php') {
    try {
        Database::pdo();
        Migrator::run();
    } catch (PDOException $e) {
        error_log('[arbre] Connexion MySQL impossible : ' . $e->getMessage());
        http_response_code(503);
        if ($currentScript === 'api.php') {
            json_error('Base de données indisponible.', 503);
        }
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Base de données indisponible</title>'
            . '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.6;color:#1e293b">'
            . '<h1 style="font-size:1.4rem">Connexion à la base de données impossible</h1>'
            . '<p>Vérifiez dans <code>app/config.php</code> le nom de la base, l\'utilisateur et le mot de passe '
            . '(sur cPanel, ils commencent par votre identifiant, par exemple <code>moncompte_arbre</code>), '
            . 'et que l\'utilisateur a bien été <b>ajouté à la base</b> avec tous les privilèges.</p>'
            . (config('debug') ? '<pre style="white-space:pre-wrap;background:#f1f5f9;padding:1rem;border-radius:.5rem">' . e($e->getMessage()) . '</pre>' : '')
            . '</body>';
        exit;
    }
}
