<?php
declare(strict_types=1);

/**
 * Mises à jour automatiques de la base : chaque migration n'est appliquée
 * qu'une fois. Le numéro de version est enregistré dans la table settings.
 * Une installation existante (cPanel…) se met donc à jour toute seule à la
 * première visite après l'envoi des nouveaux fichiers.
 */
final class Migrator
{
    public const VERSION = 2;

    public static function run(): void
    {
        $current = (int) (Settings::get('db_version') ?? 1);
        if ($current >= self::VERSION) {
            return;
        }
        for ($v = $current + 1; $v <= self::VERSION; $v++) {
            $method = 'v' . $v;
            self::$method();
            Settings::set('db_version', (string) $v);
        }
    }

    private static function hasColumn(string $table, string $column): bool
    {
        return (bool) Database::value(
            'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column]
        );
    }

    /** v2 : champ « postnom » */
    private static function v2(): void
    {
        if (!self::hasColumn('persons', 'postnom')) {
            Database::pdo()->exec('ALTER TABLE persons ADD COLUMN postnom VARCHAR(120) NULL AFTER last_name');
        }
    }
}
