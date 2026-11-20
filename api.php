<?php
declare(strict_types=1);

/**
 * API JSON de l'application.
 *   GET  api.php?action=tree
 *   POST api.php?action=person.create   (corps JSON, en-tête X-CSRF-Token)
 */

require __DIR__ . '/app/bootstrap.php';

$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Lecture seule ouverte aux visiteurs (si l'arbre est public) ; tout le reste exige un compte.
const PUBLIC_ACTIONS = ['tree', 'person', 'union', 'stats'];
$isPublicRead = $method === 'GET' && in_array($action, PUBLIC_ACTIONS, true);
if (!Auth::check() && !($isPublicRead && Auth::publicView())) {
    json_error('Connectez-vous pour effectuer cette action.', 401);
}

if ($method === 'POST') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? null);
    if (!csrf_check($token)) {
        json_error('Jeton de sécurité invalide. Rechargez la page.', 419);
    }
}

/** Exige une permission, sinon 403 */
function need(string ...$perms): void
{
    foreach ($perms as $perm) {
        if ($perm === 'admin' ? Auth::isAdmin() : Auth::can($perm)) {
            return;
        }
    }
    json_error('Vous n\'avez pas la permission d\'effectuer cette action.', 403);
}

function need_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        json_error('Méthode non autorisée.', 405);
    }
}

function int_param(array $src, string $key): int
{
    $v = clean_int($src[$key] ?? null);
    if (!$v) {
        json_error("Paramètre « $key » manquant.");
    }
    return $v;
}

$in = $method === 'POST' && str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') ? request_json() : $_POST;

try {
    switch ($action) {
        // =============================================================
        //  Lecture
        // =============================================================
        case 'tree':
            $data = Family::treeData();
            $me = Auth::user();
            json_response([
                'ok'       => true,
                'persons'  => $data['persons'],
                'unions'   => $data['unions'],
                'settings' => [
                    'family_name'    => Settings::get('family_name', 'Notre famille'),
                    'root_person_id' => clean_int(Settings::get('root_person_id')),
                ],
                'me' => $me ? [
                    'id'           => (int) $me['id'],
                    'display_name' => $me['display_name'],
                    'person_id'    => $me['person_id'] !== null ? (int) $me['person_id'] : null,
                    'perms'        => Auth::permissions(),
                    'guest'        => false,
                ] : [
                    'id' => null, 'display_name' => 'Visiteur', 'person_id' => null, 'guest' => true,
                    'perms' => ['add' => false, 'edit' => false, 'delete' => false, 'admin' => false],
                ],
            ]);

        case 'person':
            $id = int_param($_GET, 'id');
            $p = Family::person($id);
            if (!$p) {
                json_error('Personne introuvable.', 404);
            }
            if (Auth::can('delete')) {
                $p['delete_impact'] = Family::deleteImpact($id);
            }
            if (!Auth::check()) {
                // Visiteurs : pas de coordonnées, de notes privées ni de noms de comptes
                unset($p['phone'], $p['email'], $p['notes'], $p['created_by_name'], $p['updated_by_name']);
            }
            json_response(['ok' => true, 'person' => $p]);

        case 'union':
            $u = Family::union(int_param($_GET, 'id'));
            if (!$u) {
                json_error('Union introuvable.', 404);
            }
            if (!Auth::check()) {
                unset($u['notes']);
            }
            json_response(['ok' => true, 'union' => $u]);

        case 'stats':
            json_response(['ok' => true, 'stats' => Family::stats()]);

        // =============================================================
        //  Personnes
        // =============================================================
        case 'person.create':
            need_post();
            need('add');
            $rel = is_array($in['relation'] ?? null) ? $in['relation'] : [];
            $type = clean_enum($rel['type'] ?? 'none', ['none', 'child', 'parent', 'spouse', 'sibling'], 'none');
            $of = clean_int($rel['of'] ?? null);
            $existing = clean_int($in['existing_id'] ?? null);
            $childRel = clean_enum($rel['child_relation'] ?? 'biologique', Family::CHILD_RELATIONS, 'biologique');

            $result = Database::transaction(function () use ($in, $type, $of, $existing, $rel, $childRel) {
                if ($type !== 'none' && !$of) {
                    throw new DomainException('Personne de référence manquante.');
                }
                if ($of) {
                    Family::mustExist($of);
                }
                if ($existing) {
                    Family::mustExist($existing);
                    $pid = $existing;
                } else {
                    $pid = Family::createPerson(is_array($in['person'] ?? null) ? $in['person'] : []);
                }
                $unionId = null;
                switch ($type) {
                    case 'child':
                        $u = $rel['union_id'] ?? 'solo';
                        if ($u === 'solo') {
                            $unionId = Family::soloUnion($of);
                        } else {
                            $unionId = (int) $u;
                            $union = Family::union($unionId);
                            if (!$union || !in_array($of, [$union['partner1_id'], $union['partner2_id']], true)) {
                                throw new DomainException('Union invalide.');
                            }
                        }
                        Family::addChild($unionId, $pid, $childRel);
                        break;
                    case 'parent':
                        $unionId = Family::attachParent($of, $pid, $childRel);
                        break;
                    case 'spouse':
                        $unionId = Family::createUnion($of, $pid, is_array($rel['union'] ?? null) ? $rel['union'] : []);
                        break;
                    case 'sibling':
                        $parents = Family::parentsUnion($of);
                        if (!$parents) {
                            throw new DomainException('Ajoutez d\'abord au moins un parent pour pouvoir ajouter un frère ou une sœur.');
                        }
                        $unionId = $parents['id'];
                        Family::addChild($unionId, $pid, $childRel);
                        break;
                }
                // Première personne de l'arbre : elle devient la racine
                if (!Settings::get('root_person_id')) {
                    Settings::set('root_person_id', (string) $pid);
                }
                return ['id' => $pid, 'union_id' => $unionId];
            });
            json_response(['ok' => true] + $result);

        case 'person.update':
            need_post();
            need('edit');
            $id = int_param($in, 'id');
            Family::updatePerson($id, is_array($in['person'] ?? null) ? $in['person'] : []);
            json_response(['ok' => true, 'person' => Family::person($id)]);

        case 'person.delete':
            need_post();
            need('delete');
            Family::softDelete(int_param($in, 'id'));
            json_response(['ok' => true]);

        case 'person.restore':
            need_post();
            need('admin');
            Family::restore(int_param($in, 'id'));
            json_response(['ok' => true]);

        case 'person.purge':
            need_post();
            need('admin');
            Family::purge(int_param($in, 'id'));
            json_response(['ok' => true]);

        // =============================================================
        //  Unions & filiations
        // =============================================================
        case 'union.create':
            need_post();
            need('add');
            $id = Family::createUnion(int_param($in, 'partner1_id'), int_param($in, 'partner2_id'), is_array($in['union'] ?? null) ? $in['union'] : []);
            json_response(['ok' => true, 'id' => $id]);

        case 'union.update':
            need_post();
            need('edit');
            Family::updateUnion(int_param($in, 'id'), is_array($in['union'] ?? null) ? $in['union'] : []);
            json_response(['ok' => true]);

        case 'union.delete':
            need_post();
            need('delete');
            Family::deleteUnion(int_param($in, 'id'));
            json_response(['ok' => true]);

        case 'child.add':
            need_post();
            need('add', 'edit');
            Family::addChild(int_param($in, 'union_id'), int_param($in, 'child_id'), (string) ($in['relation'] ?? 'biologique'));
            json_response(['ok' => true]);

        case 'child.remove':
            need_post();
            need('edit', 'delete');
            Family::removeChild(int_param($in, 'union_id'), int_param($in, 'child_id'));
            json_response(['ok' => true]);

        // =============================================================
        //  Métiers & événements
        // =============================================================
        case 'profession.save':
            need_post();
            need('edit', 'add');
            $id = Family::saveProfession(int_param($in, 'person_id'), $in, clean_int($in['id'] ?? null));
            json_response(['ok' => true, 'id' => $id]);

        case 'profession.delete':
            need_post();
            need('edit');
            Database::run('DELETE FROM professions WHERE id = ?', [int_param($in, 'id')]);
            json_response(['ok' => true]);

        case 'event.save':
            need_post();
            need('edit', 'add');
            $id = Family::saveEvent(int_param($in, 'person_id'), $in, clean_int($in['id'] ?? null));
            json_response(['ok' => true, 'id' => $id]);

        case 'event.delete':
            need_post();
            need('edit');
            Database::run('DELETE FROM events WHERE id = ?', [int_param($in, 'id')]);
            json_response(['ok' => true]);

        // =============================================================
        //  Photos (multipart/form-data)
        // =============================================================
        case 'photo.upload':
            need_post();
            need('edit', 'add');
            $personId = int_param($_POST, 'person_id');
            Family::mustExist($personId);
            $stored = ImageService::store($_FILES['photo'] ?? []);
            $photoId = Database::insert('photos', [
                'person_id'  => $personId,
                'file_name'  => $stored['file_name'],
                'thumb_name' => $stored['thumb_name'],
                'caption'    => clean_str($_POST['caption'] ?? null),
                'year'       => clean_int($_POST['year'] ?? null),
                'created_by' => Auth::user()['id'],
            ]);
            $primary = clean_bool($_POST['primary'] ?? false);
            $hasPhoto = Database::value('SELECT photo_id FROM persons WHERE id = ?', [$personId]);
            if ($primary || !$hasPhoto) {
                Database::run('UPDATE persons SET photo_id = ? WHERE id = ?', [$photoId, $personId]);
            }
            ActivityLog::add('update', 'person', $personId, 'Nouvelle photo pour ' . Family::label($personId));
            json_response(['ok' => true, 'id' => $photoId, 'thumb' => 'uploads/' . $stored['thumb_name'], 'url' => 'uploads/' . $stored['file_name']]);

        case 'photo.update':
            need_post();
            need('edit');
            Database::run('UPDATE photos SET caption = ?, year = ? WHERE id = ?', [
                clean_str($in['caption'] ?? null), clean_int($in['year'] ?? null), int_param($in, 'id'),
            ]);
            json_response(['ok' => true]);

        case 'photo.primary':
            need_post();
            need('edit');
            $photo = Database::one('SELECT id, person_id FROM photos WHERE id = ?', [int_param($in, 'id')]);
            if (!$photo) {
                json_error('Photo introuvable.', 404);
            }
            Database::run('UPDATE persons SET photo_id = ? WHERE id = ?', [$photo['id'], $photo['person_id']]);
            json_response(['ok' => true]);

        case 'photo.delete':
            need_post();
            need('edit', 'delete');
            $photo = Database::one('SELECT * FROM photos WHERE id = ?', [int_param($in, 'id')]);
            if (!$photo) {
                json_error('Photo introuvable.', 404);
            }
            Database::transaction(function () use ($photo) {
                Database::run('UPDATE persons SET photo_id = NULL WHERE photo_id = ?', [$photo['id']]);
                Database::run('DELETE FROM photos WHERE id = ?', [$photo['id']]);
                // Une autre photo devient la photo de profil
                $next = Database::value('SELECT id FROM photos WHERE person_id = ? ORDER BY id DESC LIMIT 1', [$photo['person_id']]);
                if ($next) {
                    Database::run('UPDATE persons SET photo_id = ? WHERE id = ? AND photo_id IS NULL', [$next, $photo['person_id']]);
                }
            });
            ImageService::deleteFiles($photo['file_name'], $photo['thumb_name']);
            ActivityLog::add('delete', 'photo', (int) $photo['id'], 'Photo supprimée pour ' . Family::label((int) $photo['person_id']));
            json_response(['ok' => true]);

        // =============================================================
        //  Réglages & administration
        // =============================================================
        case 'settings.save':
            need_post();
            if (array_key_exists('public_view', $in)) {
                need('admin');
                Settings::set('public_view', clean_bool($in['public_view']) ? '1' : '0');
                ActivityLog::add('update', 'settings', null, 'Consultation publique ' . (clean_bool($in['public_view']) ? 'activée' : 'désactivée'));
            }
            if (array_key_exists('root_person_id', $in)) {
                need('edit');
                $root = clean_int($in['root_person_id']);
                if ($root) {
                    Family::mustExist($root);
                }
                Settings::set('root_person_id', $root ? (string) $root : null);
            }
            if (array_key_exists('family_name', $in)) {
                need('admin');
                Settings::set('family_name', clean_str($in['family_name'], 120) ?? 'Notre famille');
            }
            json_response(['ok' => true]);

        case 'admin.overview':
            need('admin');
            json_response([
                'ok'    => true,
                'users' => Users::all(),
                'trash' => Family::trash(),
                'log'   => ActivityLog::latest(150),
                'stats' => Family::stats(),
                'settings' => [
                    'family_name' => Settings::get('family_name', 'Notre famille'),
                    'public_view' => Auth::publicView(),
                ],
            ]);

        case 'user.save':
            need_post();
            need('admin');
            $id = Users::save($in, clean_int($in['id'] ?? null));
            json_response(['ok' => true, 'id' => $id]);

        case 'user.delete':
            need_post();
            need('admin');
            Users::delete(int_param($in, 'id'));
            json_response(['ok' => true]);

        case 'me.password':
            need_post();
            $me = Database::one('SELECT password_hash FROM users WHERE id = ?', [Auth::user()['id']]);
            if (!password_verify((string) ($in['current'] ?? ''), $me['password_hash'])) {
                json_error('Mot de passe actuel incorrect.');
            }
            $new = (string) ($in['new'] ?? '');
            if (mb_strlen($new) < 8) {
                json_error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
            }
            Database::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), Auth::user()['id']]);
            json_response(['ok' => true]);

        default:
            json_error('Action inconnue.', 404);
    }
} catch (DomainException $e) {
    json_error($e->getMessage(), 422);
} catch (Throwable $e) {
    error_log('[arbre] ' . $e);
    json_error(config('debug') ? $e->getMessage() : 'Erreur interne du serveur.', 500);
}
