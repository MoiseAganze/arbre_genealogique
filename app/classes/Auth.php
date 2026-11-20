<?php
declare(strict_types=1);

final class Auth
{
    private static ?array $user = null;
    private static bool $loaded = false;

    public static function user(): ?array
    {
        if (!self::$loaded) {
            self::$loaded = true;
            $id = $_SESSION['user_id'] ?? null;
            if ($id) {
                $u = Database::one('SELECT * FROM users WHERE id = ? AND is_active = 1', [$id]);
                if ($u) {
                    self::$user = $u;
                } else {
                    unset($_SESSION['user_id']);
                }
            }
        }
        return self::$user;
    }

    public static function check(): bool
    {
        return self::user() !== null;
    }

    /** L'arbre est-il consultable sans compte ? (réglage « public_view », activé par défaut) */
    public static function publicView(): bool
    {
        return Settings::get('public_view', '1') !== '0';
    }

    /** Peut consulter l'arbre : connecté, ou visiteur si l'arbre est public */
    public static function canView(): bool
    {
        return self::check() || self::publicView();
    }

    public static function isAdmin(): bool
    {
        return (self::user()['role'] ?? '') === 'admin';
    }

    /** Permission : 'add', 'edit', 'delete' */
    public static function can(string $perm): bool
    {
        $u = self::user();
        if (!$u) {
            return false;
        }
        if ($u['role'] === 'admin') {
            return true;
        }
        return match ($perm) {
            'add'    => (bool) $u['can_add'],
            'edit'   => (bool) $u['can_edit'],
            'delete' => (bool) $u['can_delete'],
            default  => false,
        };
    }

    public static function permissions(): array
    {
        return [
            'add'    => self::can('add'),
            'edit'   => self::can('edit'),
            'delete' => self::can('delete'),
            'admin'  => self::isAdmin(),
        ];
    }

    public static function attempt(string $username, string $password): bool
    {
        // Ralentissement simple contre les attaques par force brute
        $fails = $_SESSION['login_fails'] ?? 0;
        if ($fails >= 5) {
            sleep(min(10, $fails - 3));
        }

        $u = Database::one('SELECT * FROM users WHERE username = ? AND is_active = 1', [$username]);
        if (!$u || !self::verify($password, $u['password_hash'])) {
            $_SESSION['login_fails'] = $fails + 1;
            usleep(400000);
            return false;
        }

        // Mot de passe provisoire (SHA-256 créé en SQL) ou ancien hachage : on le sécurise tout de suite
        if (self::isProvisional($u['password_hash']) || password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            Database::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $u['id'];
        unset($_SESSION['login_fails']);
        Database::run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$u['id']]);
        self::$loaded = false;
        return true;
    }

    /**
     * Vérifie un mot de passe. Accepte aussi un hachage SHA-256 (64 caractères
     * hexadécimaux) créé à la main avec SHA2('…', 256) lors d'une installation
     * manuelle ; il est remplacé par bcrypt à la première connexion.
     */
    public static function verify(string $password, string $hash): bool
    {
        if (self::isProvisional($hash)) {
            return hash_equals(strtolower($hash), hash('sha256', $password));
        }
        return password_verify($password, $hash);
    }

    public static function isProvisional(string $hash): bool
    {
        return (bool) preg_match('/^[a-f0-9]{64}$/i', $hash);
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    public static function requireLogin(): void
    {
        if (!self::check()) {
            redirect('login.php');
        }
    }
}
