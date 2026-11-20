<?php
declare(strict_types=1);

final class Users
{
    public static function all(): array
    {
        return array_map([self::class, 'present'], Database::all(
            'SELECT id, username, display_name, email, role, can_add, can_edit, can_delete, is_active, person_id, last_login_at, created_at
               FROM users ORDER BY role = "admin" DESC, display_name'
        ));
    }

    public static function present(array $u): array
    {
        foreach (['id', 'person_id'] as $k) {
            $u[$k] = $u[$k] !== null ? (int) $u[$k] : null;
        }
        foreach (['can_add', 'can_edit', 'can_delete', 'is_active'] as $k) {
            $u[$k] = (bool) $u[$k];
        }
        unset($u['password_hash']);
        return $u;
    }

    public static function save(array $in, ?int $id = null): int
    {
        $username = clean_str($in['username'] ?? null, 60);
        $display = clean_str($in['display_name'] ?? null, 120);
        if (!$username || !preg_match('/^[a-zA-Z0-9._-]{3,60}$/', $username)) {
            throw new DomainException('Identifiant invalide (3 caractères minimum : lettres, chiffres, . _ -).');
        }
        if (!$display) {
            throw new DomainException('Le nom affiché est obligatoire.');
        }
        $email = clean_str($in['email'] ?? null, 190);
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new DomainException('Adresse e-mail invalide.');
        }
        $exists = Database::value('SELECT id FROM users WHERE username = ? AND id <> ?', [$username, $id ?? 0]);
        if ($exists) {
            throw new DomainException('Cet identifiant est déjà utilisé.');
        }

        $role = clean_enum($in['role'] ?? null, ['admin', 'member'], 'member');
        $data = [
            'username'     => $username,
            'display_name' => $display,
            'email'        => $email,
            'role'         => $role,
            'can_add'      => clean_bool($in['can_add'] ?? false),
            'can_edit'     => clean_bool($in['can_edit'] ?? false),
            'can_delete'   => clean_bool($in['can_delete'] ?? false),
            'is_active'    => clean_bool($in['is_active'] ?? true),
            'person_id'    => clean_int($in['person_id'] ?? null),
        ];

        $password = (string) ($in['password'] ?? '');
        if ($id === null || $password !== '') {
            if (mb_strlen($password) < 8) {
                throw new DomainException('Le mot de passe doit contenir au moins 8 caractères.');
            }
            $data['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        }

        if ($id !== null) {
            $current = Database::one('SELECT role FROM users WHERE id = ?', [$id]);
            if (!$current) {
                throw new DomainException('Utilisateur introuvable.');
            }
            // Ne pas retirer le dernier administrateur
            if ($current['role'] === 'admin' && ($role !== 'admin' || !$data['is_active'])) {
                $admins = (int) Database::value('SELECT COUNT(*) FROM users WHERE role = "admin" AND is_active = 1 AND id <> ?', [$id]);
                if ($admins === 0) {
                    throw new DomainException('Il doit rester au moins un administrateur actif.');
                }
            }
            Database::update('users', $id, $data);
            ActivityLog::add('update', 'user', $id, 'Modification du compte « ' . $username . ' »');
            return $id;
        }

        $newId = Database::insert('users', $data);
        ActivityLog::add('create', 'user', $newId, 'Création du compte « ' . $username . ' »');
        return $newId;
    }

    public static function delete(int $id): void
    {
        if ($id === (int) (Auth::user()['id'] ?? 0)) {
            throw new DomainException('Vous ne pouvez pas supprimer votre propre compte.');
        }
        $u = Database::one('SELECT username, role FROM users WHERE id = ?', [$id]);
        if (!$u) {
            throw new DomainException('Utilisateur introuvable.');
        }
        if ($u['role'] === 'admin' && (int) Database::value('SELECT COUNT(*) FROM users WHERE role = "admin" AND is_active = 1 AND id <> ?', [$id]) === 0) {
            throw new DomainException('Il doit rester au moins un administrateur actif.');
        }
        Database::run('DELETE FROM users WHERE id = ?', [$id]);
        ActivityLog::add('delete', 'user', $id, 'Suppression du compte « ' . $u['username'] . ' »');
    }
}
