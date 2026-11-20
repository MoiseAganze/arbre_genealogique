<?php
declare(strict_types=1);

/**
 * Accès aux données de l'arbre : personnes, unions, filiations, détails de vie.
 */
final class Family
{
    public const GENDERS        = ['M', 'F', 'U'];
    public const UNION_TYPES    = ['mariage', 'pacs', 'union_libre', 'fiancailles', 'religieux', 'coutumier', 'inconnu'];
    public const UNION_STATUSES = ['en_cours', 'divorce', 'separe', 'veuvage', 'annule'];
    public const CHILD_RELATIONS = ['biologique', 'adoptif', 'accueil', 'inconnu'];
    public const EVENT_TYPES    = ['naissance', 'bapteme', 'etudes', 'diplome', 'travail', 'demenagement', 'militaire', 'voyage', 'distinction', 'sante', 'religion', 'deces', 'autre'];

    // -----------------------------------------------------------------
    //  Lecture de l'arbre complet (vue compacte pour le JavaScript)
    // -----------------------------------------------------------------
    public static function treeData(): array
    {
        $persons = Database::all(
            "SELECT p.id, p.first_names, p.last_name, p.postnom, p.birth_name, p.nickname, p.gender, p.is_living,
                    p.birth_date, p.birth_approx, p.birth_place, p.death_date, p.death_approx, p.death_place,
                    p.occupation, ph.thumb_name AS photo_thumb
               FROM persons p
          LEFT JOIN photos ph ON ph.id = p.photo_id
              WHERE p.deleted_at IS NULL
           ORDER BY p.id"
        );
        $alive = [];
        foreach ($persons as &$p) {
            $p['id'] = (int) $p['id'];
            $p['is_living'] = (bool) $p['is_living'];
            $p['birth_approx'] = (bool) $p['birth_approx'];
            $p['death_approx'] = (bool) $p['death_approx'];
            $p['photo'] = $p['photo_thumb'] ? 'uploads/' . $p['photo_thumb'] : null;
            unset($p['photo_thumb']);
            $alive[$p['id']] = true;
        }
        unset($p);

        $unions = Database::all('SELECT id, partner1_id, partner2_id, type, status, start_date, start_approx, start_place, end_date, end_approx FROM unions ORDER BY id');
        $out = [];
        foreach ($unions as $u) {
            $p1 = $u['partner1_id'] !== null && isset($alive[(int) $u['partner1_id']]) ? (int) $u['partner1_id'] : null;
            $p2 = $u['partner2_id'] !== null && isset($alive[(int) $u['partner2_id']]) ? (int) $u['partner2_id'] : null;
            if ($p1 === null && $p2 === null) {
                continue;
            }
            $out[(int) $u['id']] = [
                'id'           => (int) $u['id'],
                'partners'     => array_values(array_filter([$p1, $p2], fn ($v) => $v !== null)),
                'type'         => $u['type'],
                'status'       => $u['status'],
                'start_date'   => $u['start_date'],
                'start_approx' => (bool) $u['start_approx'],
                'start_place'  => $u['start_place'],
                'end_date'     => $u['end_date'],
                'end_approx'   => (bool) $u['end_approx'],
                'children'     => [],
            ];
        }

        foreach (Database::all('SELECT union_id, child_id, relation FROM union_children ORDER BY sort_order, child_id') as $c) {
            $uid = (int) $c['union_id'];
            $cid = (int) $c['child_id'];
            if (isset($out[$uid], $alive[$cid])) {
                $out[$uid]['children'][] = ['id' => $cid, 'relation' => $c['relation']];
            }
        }

        return ['persons' => $persons, 'unions' => array_values($out)];
    }

    // -----------------------------------------------------------------
    //  Personne détaillée
    // -----------------------------------------------------------------
    public static function person(int $id, bool $withDeleted = false): ?array
    {
        $p = Database::one(
            'SELECT p.*, ph.file_name AS photo_file, ph.thumb_name AS photo_thumb,
                    cu.display_name AS created_by_name, uu.display_name AS updated_by_name
               FROM persons p
          LEFT JOIN photos ph ON ph.id = p.photo_id
          LEFT JOIN users cu ON cu.id = p.created_by
          LEFT JOIN users uu ON uu.id = p.updated_by
              WHERE p.id = ?' . ($withDeleted ? '' : ' AND p.deleted_at IS NULL'),
            [$id]
        );
        if (!$p) {
            return null;
        }
        foreach (['id', 'photo_id'] as $k) {
            $p[$k] = $p[$k] !== null ? (int) $p[$k] : null;
        }
        foreach (['is_living', 'birth_approx', 'death_approx'] as $k) {
            $p[$k] = (bool) $p[$k];
        }
        $p['photo'] = $p['photo_thumb'] ? 'uploads/' . $p['photo_thumb'] : null;
        $p['photo_full'] = $p['photo_file'] ? 'uploads/' . $p['photo_file'] : null;
        unset($p['photo_file'], $p['photo_thumb'], $p['created_by'], $p['updated_by'], $p['deleted_by']);

        $p['professions'] = Database::all(
            'SELECT id, title, employer, place, start_year, end_year, description FROM professions
              WHERE person_id = ? ORDER BY (start_year IS NULL), start_year, id',
            [$id]
        );
        $p['events'] = array_map(function ($e) {
            $e['date_approx'] = (bool) $e['date_approx'];
            return $e;
        }, Database::all(
            'SELECT id, type, title, event_date, date_approx, place, description FROM events
              WHERE person_id = ? ORDER BY (event_date IS NULL), event_date, id',
            [$id]
        ));
        $p['photos'] = array_map(fn ($ph) => [
            'id'      => (int) $ph['id'],
            'url'     => 'uploads/' . $ph['file_name'],
            'thumb'   => 'uploads/' . $ph['thumb_name'],
            'caption' => $ph['caption'],
            'year'    => $ph['year'] !== null ? (int) $ph['year'] : null,
        ], Database::all('SELECT * FROM photos WHERE person_id = ? ORDER BY (year IS NULL), year, id', [$id]));

        return $p;
    }

    /** Champs modifiables d'une personne, nettoyés */
    public static function personFields(array $in, bool $partial = false): array
    {
        $map = [
            'first_names'  => fn ($v) => clean_str($v, 160),
            'last_name'    => fn ($v) => clean_str($v, 120) ?? '',
            'postnom'      => fn ($v) => clean_str($v, 120),
            'birth_name'   => fn ($v) => clean_str($v, 120),
            'nickname'     => fn ($v) => clean_str($v, 80),
            'gender'       => fn ($v) => clean_enum($v, self::GENDERS, 'U'),
            'is_living'    => fn ($v) => clean_bool($v ?? true),
            'birth_date'   => fn ($v) => clean_partial_date($v),
            'birth_approx' => fn ($v) => clean_bool($v),
            'birth_place'  => fn ($v) => clean_str($v, 190),
            'death_date'   => fn ($v) => clean_partial_date($v),
            'death_approx' => fn ($v) => clean_bool($v),
            'death_place'  => fn ($v) => clean_str($v, 190),
            'death_cause'  => fn ($v) => clean_str($v, 190),
            'burial_place' => fn ($v) => clean_str($v, 190),
            'occupation'   => fn ($v) => clean_str($v, 160),
            'nationality'  => fn ($v) => clean_str($v, 120),
            'religion'     => fn ($v) => clean_str($v, 120),
            'education'    => fn ($v) => clean_str($v, 255),
            'residence'    => fn ($v) => clean_str($v, 255),
            'hobbies'      => fn ($v) => clean_str($v, 255),
            'phone'        => fn ($v) => clean_str($v, 60),
            'email'        => fn ($v) => clean_str($v, 190),
            'biography'    => fn ($v) => clean_text($v),
            'anecdotes'    => fn ($v) => clean_text($v),
            'notes'        => fn ($v) => clean_text($v),
        ];
        $out = [];
        foreach ($map as $key => $fn) {
            if ($partial && !array_key_exists($key, $in)) {
                continue;
            }
            $out[$key] = $fn($in[$key] ?? null);
        }
        // Une personne avec une date de décès est forcément décédée
        if (!empty($out['death_date']) || !empty($out['death_place'])) {
            $out['is_living'] = 0;
        }
        return $out;
    }

    public static function createPerson(array $in): int
    {
        $data = self::personFields($in);
        if (empty($data['first_names'])) {
            throw new DomainException('Le prénom est obligatoire.');
        }
        $data['created_by'] = Auth::user()['id'] ?? null;
        $data['updated_by'] = $data['created_by'];
        $id = Database::insert('persons', $data);
        ActivityLog::add('create', 'person', $id, 'Ajout de ' . self::label($id));
        return $id;
    }

    public static function updatePerson(int $id, array $in): void
    {
        self::mustExist($id);
        $data = self::personFields($in, true);
        if (array_key_exists('first_names', $data) && empty($data['first_names'])) {
            throw new DomainException('Le prénom est obligatoire.');
        }
        $data['updated_by'] = Auth::user()['id'] ?? null;
        Database::update('persons', $id, $data);
        ActivityLog::add('update', 'person', $id, 'Modification de ' . self::label($id));
    }

    public static function softDelete(int $id): void
    {
        self::mustExist($id);
        $label = self::label($id);
        Database::run('UPDATE persons SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [Auth::user()['id'] ?? null, $id]);
        ActivityLog::add('delete', 'person', $id, 'Suppression (corbeille) de ' . $label);
        if ((int) Settings::get('root_person_id') === $id) {
            Settings::set('root_person_id', null);
        }
    }

    public static function restore(int $id): void
    {
        Database::run('UPDATE persons SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [$id]);
        ActivityLog::add('restore', 'person', $id, 'Restauration de ' . self::label($id));
    }

    public static function purge(int $id): void
    {
        $label = self::label($id);
        $files = Database::all('SELECT file_name, thumb_name FROM photos WHERE person_id = ?', [$id]);
        Database::transaction(function () use ($id) {
            Database::run('DELETE FROM persons WHERE id = ? AND deleted_at IS NOT NULL', [$id]);
            // Unions devenues vides
            Database::run('DELETE FROM unions WHERE partner1_id IS NULL AND partner2_id IS NULL');
        });
        foreach ($files as $f) {
            ImageService::deleteFiles($f['file_name'], $f['thumb_name']);
        }
        ActivityLog::add('purge', 'person', $id, 'Suppression définitive de ' . $label);
    }

    public static function trash(): array
    {
        return Database::all(
            'SELECT p.id, p.first_names, p.last_name, p.postnom, p.birth_date, p.death_date, p.deleted_at, u.display_name AS deleted_by_name
               FROM persons p LEFT JOIN users u ON u.id = p.deleted_by
              WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC'
        );
    }

    /** Ce qui sera affecté si on supprime la personne */
    public static function deleteImpact(int $id): array
    {
        $unions = Database::all('SELECT id FROM unions WHERE partner1_id = ? OR partner2_id = ?', [$id, $id]);
        $children = 0;
        foreach ($unions as $u) {
            $children += (int) Database::value(
                'SELECT COUNT(*) FROM union_children uc JOIN persons p ON p.id = uc.child_id AND p.deleted_at IS NULL WHERE uc.union_id = ?',
                [$u['id']]
            );
        }
        $parents = (int) Database::value('SELECT COUNT(*) FROM union_children WHERE child_id = ?', [$id]);
        return ['unions' => count($unions), 'children' => $children, 'parent_links' => $parents];
    }

    public static function label(int $id): string
    {
        $p = Database::one('SELECT first_names, last_name, postnom FROM persons WHERE id = ?', [$id]);
        return $p ? trim(implode(' ', array_filter([$p['first_names'], $p['last_name'], $p['postnom']]))) : '#' . $id;
    }

    public static function mustExist(int $id): void
    {
        if (!Database::value('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL', [$id])) {
            throw new DomainException('Personne introuvable.');
        }
    }

    // -----------------------------------------------------------------
    //  Unions
    // -----------------------------------------------------------------
    public static function unionFields(array $in): array
    {
        return [
            'type'         => clean_enum($in['type'] ?? null, self::UNION_TYPES, 'mariage'),
            'status'       => clean_enum($in['status'] ?? null, self::UNION_STATUSES, 'en_cours'),
            'start_date'   => clean_partial_date($in['start_date'] ?? null),
            'start_approx' => clean_bool($in['start_approx'] ?? false),
            'start_place'  => clean_str($in['start_place'] ?? null, 190),
            'end_date'     => clean_partial_date($in['end_date'] ?? null),
            'end_approx'   => clean_bool($in['end_approx'] ?? false),
            'notes'        => clean_text($in['notes'] ?? null, 5000),
        ];
    }

    public static function union(int $id): ?array
    {
        $u = Database::one('SELECT * FROM unions WHERE id = ?', [$id]);
        if (!$u) {
            return null;
        }
        $u['id'] = (int) $u['id'];
        $u['partner1_id'] = $u['partner1_id'] !== null ? (int) $u['partner1_id'] : null;
        $u['partner2_id'] = $u['partner2_id'] !== null ? (int) $u['partner2_id'] : null;
        $u['start_approx'] = (bool) $u['start_approx'];
        $u['end_approx'] = (bool) $u['end_approx'];
        return $u;
    }

    public static function createUnion(?int $p1, ?int $p2, array $in): int
    {
        if ($p1 !== null) {
            self::mustExist($p1);
        }
        if ($p2 !== null) {
            self::mustExist($p2);
        }
        if ($p1 !== null && $p1 === $p2) {
            throw new DomainException('Une personne ne peut pas être en union avec elle-même.');
        }
        if ($p1 !== null && $p2 !== null) {
            $dup = Database::value(
                'SELECT id FROM unions WHERE (partner1_id = ? AND partner2_id = ?) OR (partner1_id = ? AND partner2_id = ?)',
                [$p1, $p2, $p2, $p1]
            );
            if ($dup) {
                throw new DomainException('Ces deux personnes sont déjà unies.');
            }
            if (self::isAncestor($p1, $p2) || self::isAncestor($p2, $p1)) {
                throw new DomainException('Impossible : l\'une de ces personnes est l\'ancêtre de l\'autre.');
            }
        }
        $data = self::unionFields($in) + ['partner1_id' => $p1, 'partner2_id' => $p2];
        $id = Database::insert('unions', $data);
        if ($p1 !== null && $p2 !== null) {
            ActivityLog::add('create', 'union', $id, 'Union entre ' . self::label($p1) . ' et ' . self::label($p2));
        }
        return $id;
    }

    public static function updateUnion(int $id, array $in): void
    {
        if (!self::union($id)) {
            throw new DomainException('Union introuvable.');
        }
        Database::update('unions', $id, self::unionFields($in));
        ActivityLog::add('update', 'union', $id, 'Modification d\'une union (' . self::unionLabel($id) . ')');
    }

    public static function deleteUnion(int $id): void
    {
        $label = self::unionLabel($id);
        Database::run('DELETE FROM unions WHERE id = ?', [$id]);
        ActivityLog::add('delete', 'union', $id, 'Suppression de l\'union ' . $label);
    }

    public static function unionLabel(int $id): string
    {
        $u = self::union($id);
        if (!$u) {
            return '#' . $id;
        }
        $names = [];
        foreach ([$u['partner1_id'], $u['partner2_id']] as $pid) {
            if ($pid) {
                $names[] = self::label($pid);
            }
        }
        return implode(' & ', $names) ?: '#' . $id;
    }

    /** Union « parent seul » de la personne (créée si besoin) */
    public static function soloUnion(int $personId): int
    {
        $id = Database::value(
            'SELECT id FROM unions WHERE (partner1_id = ? AND partner2_id IS NULL) OR (partner2_id = ? AND partner1_id IS NULL) LIMIT 1',
            [$personId, $personId]
        );
        if ($id) {
            return (int) $id;
        }
        return Database::insert('unions', ['partner1_id' => $personId, 'partner2_id' => null, 'type' => 'inconnu', 'status' => 'en_cours']);
    }

    /** Union des parents de l'enfant (biologique en priorité) */
    public static function parentsUnion(int $childId): ?array
    {
        $row = Database::one(
            "SELECT u.id FROM union_children uc JOIN unions u ON u.id = uc.union_id
              WHERE uc.child_id = ? ORDER BY uc.relation = 'biologique' DESC, u.id LIMIT 1",
            [$childId]
        );
        return $row ? self::union((int) $row['id']) : null;
    }

    public static function addChild(int $unionId, int $childId, string $relation = 'biologique'): void
    {
        $u = self::union($unionId);
        if (!$u) {
            throw new DomainException('Union introuvable.');
        }
        self::mustExist($childId);
        foreach ([$u['partner1_id'], $u['partner2_id']] as $parent) {
            if ($parent === null) {
                continue;
            }
            if ($parent === $childId || self::isAncestor($childId, $parent)) {
                throw new DomainException('Impossible : cela créerait une boucle dans l\'arbre (une personne serait son propre ancêtre).');
            }
        }
        $relation = clean_enum($relation, self::CHILD_RELATIONS, 'biologique');
        if ($relation === 'biologique') {
            $other = Database::value(
                "SELECT union_id FROM union_children WHERE child_id = ? AND relation = 'biologique' AND union_id <> ?",
                [$childId, $unionId]
            );
            if ($other) {
                throw new DomainException('Cette personne a déjà des parents biologiques. Choisissez « adoptif » ou « accueil ».');
            }
        }
        $order = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM union_children WHERE union_id = ?', [$unionId]);
        Database::run(
            'INSERT INTO union_children (union_id, child_id, relation, sort_order) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE relation = VALUES(relation)',
            [$unionId, $childId, $relation, $order]
        );
        ActivityLog::add('link', 'person', $childId, self::label($childId) . ' rattaché(e) comme enfant de ' . self::unionLabel($unionId));
    }

    public static function removeChild(int $unionId, int $childId): void
    {
        Database::run('DELETE FROM union_children WHERE union_id = ? AND child_id = ?', [$unionId, $childId]);
        ActivityLog::add('unlink', 'person', $childId, self::label($childId) . ' détaché(e) de ' . self::unionLabel($unionId));
    }

    /** $ancestorId est-il un ancêtre de $personId ? */
    public static function isAncestor(int $ancestorId, int $personId): bool
    {
        $seen = [];
        $queue = [$personId];
        while ($queue) {
            $current = array_shift($queue);
            $parents = Database::all(
                'SELECT u.partner1_id, u.partner2_id FROM union_children uc JOIN unions u ON u.id = uc.union_id WHERE uc.child_id = ?',
                [$current]
            );
            foreach ($parents as $row) {
                foreach ([$row['partner1_id'], $row['partner2_id']] as $pid) {
                    if ($pid === null) {
                        continue;
                    }
                    $pid = (int) $pid;
                    if ($pid === $ancestorId) {
                        return true;
                    }
                    if (!isset($seen[$pid])) {
                        $seen[$pid] = true;
                        $queue[] = $pid;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Ajoute un parent à une personne : complète l'union existante des parents
     * si une place est libre, sinon crée l'union.
     */
    public static function attachParent(int $childId, int $parentId, string $relation = 'biologique'): int
    {
        self::mustExist($childId);
        self::mustExist($parentId);
        if ($childId === $parentId || self::isAncestor($childId, $parentId)) {
            throw new DomainException('Impossible : cela créerait une boucle dans l\'arbre.');
        }
        $relation = clean_enum($relation, self::CHILD_RELATIONS, 'biologique');
        $existing = Database::one(
            'SELECT u.* FROM union_children uc JOIN unions u ON u.id = uc.union_id WHERE uc.child_id = ? AND uc.relation = ? ORDER BY u.id LIMIT 1',
            [$childId, $relation]
        );
        if ($existing) {
            $p1 = $existing['partner1_id'] !== null ? (int) $existing['partner1_id'] : null;
            $p2 = $existing['partner2_id'] !== null ? (int) $existing['partner2_id'] : null;
            if ($p1 === $parentId || $p2 === $parentId) {
                throw new DomainException('Cette personne est déjà parent.');
            }
            $p1Alive = $p1 !== null && Database::value('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL', [$p1]);
            $p2Alive = $p2 !== null && Database::value('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL', [$p2]);
            if (!$p1Alive || !$p2Alive) {
                // Si ce parent a déjà une union avec l'autre parent, on y rattache l'enfant
                $other = $p1Alive ? $p1 : ($p2Alive ? $p2 : null);
                if ($other !== null) {
                    $dup = Database::value(
                        'SELECT id FROM unions WHERE (partner1_id = ? AND partner2_id = ?) OR (partner1_id = ? AND partner2_id = ?)',
                        [$other, $parentId, $parentId, $other]
                    );
                    if ($dup) {
                        Database::run('DELETE FROM union_children WHERE union_id = ? AND child_id = ?', [$existing['id'], $childId]);
                        self::addChild((int) $dup, $childId, $relation);
                        return (int) $dup;
                    }
                }
                $col = !$p1Alive ? 'partner1_id' : 'partner2_id';
                Database::run("UPDATE unions SET $col = ? WHERE id = ?", [$parentId, $existing['id']]);
                ActivityLog::add('link', 'person', $childId, self::label($parentId) . ' ajouté(e) comme parent de ' . self::label($childId));
                return (int) $existing['id'];
            }
            throw new DomainException('Cette personne a déjà deux parents ' . ($relation === 'biologique' ? 'biologiques' : $relation . 's') . '.');
        }
        $unionId = Database::insert('unions', ['partner1_id' => $parentId, 'partner2_id' => null, 'type' => 'inconnu', 'status' => 'en_cours']);
        self::addChild($unionId, $childId, $relation);
        return $unionId;
    }

    // -----------------------------------------------------------------
    //  Métiers, événements
    // -----------------------------------------------------------------
    public static function saveProfession(int $personId, array $in, ?int $id = null): int
    {
        self::mustExist($personId);
        $data = [
            'title'       => clean_str($in['title'] ?? null, 160),
            'employer'    => clean_str($in['employer'] ?? null, 160),
            'place'       => clean_str($in['place'] ?? null, 160),
            'start_year'  => clean_int($in['start_year'] ?? null),
            'end_year'    => clean_int($in['end_year'] ?? null),
            'description' => clean_text($in['description'] ?? null, 5000),
        ];
        if (!$data['title']) {
            throw new DomainException('L\'intitulé du métier est obligatoire.');
        }
        if ($id) {
            Database::run(
                'UPDATE professions SET title=:title, employer=:employer, place=:place, start_year=:start_year, end_year=:end_year, description=:description WHERE id=:id AND person_id=:pid',
                $data + ['id' => $id, 'pid' => $personId]
            );
        } else {
            $id = Database::insert('professions', $data + ['person_id' => $personId]);
        }
        ActivityLog::add('update', 'person', $personId, 'Métier « ' . $data['title'] . ' » pour ' . self::label($personId));
        return $id;
    }

    public static function saveEvent(int $personId, array $in, ?int $id = null): int
    {
        self::mustExist($personId);
        $data = [
            'type'        => clean_enum($in['type'] ?? null, self::EVENT_TYPES, 'autre'),
            'title'       => clean_str($in['title'] ?? null, 190),
            'event_date'  => clean_partial_date($in['event_date'] ?? null),
            'date_approx' => clean_bool($in['date_approx'] ?? false),
            'place'       => clean_str($in['place'] ?? null, 190),
            'description' => clean_text($in['description'] ?? null, 5000),
        ];
        if (!$data['title']) {
            throw new DomainException('Le titre de l\'événement est obligatoire.');
        }
        if ($id) {
            Database::run(
                'UPDATE events SET type=:type, title=:title, event_date=:event_date, date_approx=:date_approx, place=:place, description=:description WHERE id=:id AND person_id=:pid',
                $data + ['id' => $id, 'pid' => $personId]
            );
        } else {
            $id = Database::insert('events', $data + ['person_id' => $personId]);
        }
        ActivityLog::add('update', 'person', $personId, 'Événement « ' . $data['title'] . ' » pour ' . self::label($personId));
        return $id;
    }

    // -----------------------------------------------------------------
    //  Statistiques
    // -----------------------------------------------------------------
    public static function stats(): array
    {
        return [
            'persons'  => (int) Database::value('SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL'),
            'living'   => (int) Database::value('SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL AND is_living = 1'),
            'deceased' => (int) Database::value('SELECT COUNT(*) FROM persons WHERE deleted_at IS NULL AND is_living = 0'),
            'unions'   => (int) Database::value('SELECT COUNT(*) FROM unions WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL'),
            'photos'   => (int) Database::value('SELECT COUNT(*) FROM photos'),
            'trash'    => (int) Database::value('SELECT COUNT(*) FROM persons WHERE deleted_at IS NOT NULL'),
        ];
    }
}
