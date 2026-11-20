<?php
declare(strict_types=1);

final class Settings
{
    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache === null) {
            self::$cache = [];
            foreach (Database::all('SELECT name, value FROM settings') as $row) {
                self::$cache[$row['name']] = $row['value'];
            }
        }
        return self::$cache;
    }

    public static function get(string $name, ?string $default = null): ?string
    {
        return self::all()[$name] ?? $default;
    }

    public static function set(string $name, ?string $value): void
    {
        Database::run(
            'INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            [$name, $value]
        );
        self::$cache = null;
    }
}
