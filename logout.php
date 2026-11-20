<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && csrf_check($_POST['csrf'] ?? null)) {
    Auth::logout();
}
// Si l'arbre est public, on revient à l'arbre en lecture seule
redirect(Auth::publicView() ? 'index.php' : 'login.php');
