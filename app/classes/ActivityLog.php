<?php
declare(strict_types=1);

final class ActivityLog
{
    public static function add(string $action, string $entityType, ?int $entityId, string $summary): void
    {
        Database::insert('activity_log', [
            'user_id'     => Auth::user()['id'] ?? null,
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'summary'     => mb_substr($summary, 0, 255),
        ]);
    }

    public static function latest(int $limit = 100, int $offset = 0): array
    {
        return Database::all(
            'SELECT l.*, u.display_name AS user_name
               FROM activity_log l
          LEFT JOIN users u ON u.id = l.user_id
           ORDER BY l.id DESC
              LIMIT ' . max(1, min(500, $limit)) . ' OFFSET ' . max(0, $offset)
        );
    }
}
