<?php
declare(strict_types=1);

/**
 * Réception, validation et redimensionnement des photos.
 * Chaque image est ré-encodée (ce qui supprime tout contenu non-image).
 */
final class ImageService
{
    private const MAX_BYTES = 12 * 1024 * 1024;
    private const MAX_SIDE = 1600;
    private const THUMB_SIDE = 400;

    /** @return array{file_name:string, thumb_name:string} */
    public static function store(array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new DomainException(match ($file['error'] ?? 0) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Image trop lourde.',
                UPLOAD_ERR_NO_FILE => 'Aucune image reçue.',
                default => 'Échec de l\'envoi de l\'image.',
            });
        }
        if ($file['size'] > self::MAX_BYTES) {
            throw new DomainException('Image trop lourde (12 Mo maximum).');
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            throw new DomainException('Fichier invalide.');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);
        $info = @getimagesize($file['tmp_name']);
        if (!$info || !in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            throw new DomainException('Format non pris en charge (JPEG, PNG, WebP ou GIF).');
        }
        if ($info[0] * $info[1] > 40_000_000) {
            throw new DomainException('Image trop grande.');
        }

        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
            'image/png'  => @imagecreatefrompng($file['tmp_name']),
            'image/webp' => @imagecreatefromwebp($file['tmp_name']),
            'image/gif'  => @imagecreatefromgif($file['tmp_name']),
        };
        if (!$src) {
            throw new DomainException('Image illisible.');
        }
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $src = self::orient($src, $file['tmp_name']);
        }

        if (!is_dir(UPLOAD_DIR)) {
            mkdir(UPLOAD_DIR, 0775, true);
        }

        $base = bin2hex(random_bytes(16));
        $useWebp = function_exists('imagewebp');
        $ext = $useWebp ? 'webp' : 'jpg';

        $full = self::resize($src, self::MAX_SIDE, false);
        $thumb = self::resize($src, self::THUMB_SIDE, true);

        $fileName = "$base.$ext";
        $thumbName = "{$base}_t.$ext";
        self::save($full, UPLOAD_DIR . '/' . $fileName, $useWebp, 86);
        self::save($thumb, UPLOAD_DIR . '/' . $thumbName, $useWebp, 84);

        imagedestroy($src);
        return ['file_name' => $fileName, 'thumb_name' => $thumbName];
    }

    public static function deleteFiles(?string ...$names): void
    {
        foreach ($names as $name) {
            if ($name && preg_match('/^[a-f0-9]{32}(_t)?\.(webp|jpg)$/', $name)) {
                @unlink(UPLOAD_DIR . '/' . $name);
            }
        }
    }

    private static function resize(GdImage $src, int $max, bool $square): GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        if ($square) {
            $side = min($w, $h);
            $sx = (int) (($w - $side) / 2);
            // Pour un portrait on favorise le haut de l'image (visage)
            $sy = $h > $w ? (int) (($h - $side) * 0.25) : (int) (($h - $side) / 2);
            $dst = min($max, $side);
            $out = imagecreatetruecolor($dst, $dst);
            self::prepare($out);
            imagecopyresampled($out, $src, 0, 0, $sx, $sy, $dst, $dst, $side, $side);
            return $out;
        }
        $ratio = min(1, $max / max($w, $h));
        $nw = max(1, (int) round($w * $ratio));
        $nh = max(1, (int) round($h * $ratio));
        $out = imagecreatetruecolor($nw, $nh);
        self::prepare($out);
        imagecopyresampled($out, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $out;
    }

    private static function prepare(GdImage $img): void
    {
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagefill($img, 0, 0, imagecolorallocatealpha($img, 255, 255, 255, 127));
        imagealphablending($img, true);
    }

    private static function save(GdImage $img, string $path, bool $webp, int $quality): void
    {
        $ok = $webp ? imagewebp($img, $path, $quality) : imagejpeg($img, $path, $quality);
        imagedestroy($img);
        if (!$ok) {
            throw new RuntimeException('Impossible d\'enregistrer l\'image.');
        }
    }

    private static function orient(GdImage $img, string $path): GdImage
    {
        $exif = @exif_read_data($path);
        $o = $exif['Orientation'] ?? 1;
        $rotated = match ((int) $o) {
            3 => imagerotate($img, 180, 0),
            6 => imagerotate($img, -90, 0),
            8 => imagerotate($img, 90, 0),
            default => null,
        };
        return $rotated ?: $img;
    }
}
