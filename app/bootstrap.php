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
    header('Location: install.php');
    exit;
}
