<?php
declare(strict_types=1);

/** Échappement HTML */
function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Jeton CSRF de la session */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_check(?string $token): bool
{
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

/** Réponse JSON puis arrêt */
function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): never
{
    json_response(['ok' => false, 'error' => $message] + $extra, $status);
}

function redirect(string $url): never
{
    header('Location: ' . $url);
    exit;
}

/** Nettoie une chaîne facultative : null si vide */
function clean_str(mixed $value, int $max = 255): ?string
{
    if ($value === null) {
        return null;
    }
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    return mb_substr($value, 0, $max);
}

function clean_text(mixed $value, int $max = 20000): ?string
{
    if ($value === null) {
        return null;
    }
    $value = trim(str_replace("\r\n", "\n", (string) $value));
    return $value === '' ? null : mb_substr($value, 0, $max);
}

function clean_bool(mixed $value): int
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
}

/**
 * Valide une date partielle : 'AAAA', 'AAAA-MM' ou 'AAAA-MM-JJ'.
 * Retourne la valeur normalisée ou null.
 */
function clean_partial_date(mixed $value): ?string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') {
        return null;
    }
    if (preg_match('/^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/', $value, $m)) {
        $y = (int) $m[1];
        $mo = isset($m[2]) && $m[2] !== '' ? (int) $m[2] : null;
        $d = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null;
        if ($y < 1 || $y > 2200) {
            return null;
        }
        if ($mo === null) {
            return sprintf('%04d', $y);
        }
        if ($mo < 1 || $mo > 12) {
            return null;
        }
        if ($d === null) {
            return sprintf('%04d-%02d', $y, $mo);
        }
        if (!checkdate($mo, $d, $y)) {
            return null;
        }
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }
    return null;
}

function clean_enum(mixed $value, array $allowed, string $default): string
{
    return in_array($value, $allowed, true) ? $value : $default;
}

function clean_int(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    $int = filter_var($value, FILTER_VALIDATE_INT);
    return $int === false ? null : $int;
}

/** Corps JSON de la requête */
function request_json(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input') ?: '';
        $decoded = json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

/** Version des fichiers statiques pour casser le cache */
function asset(string $path): string
{
    $file = APP_ROOT . '/' . ltrim($path, '/');
    $v = is_file($file) ? filemtime($file) : 1;
    return $path . '?v=' . $v;
}
