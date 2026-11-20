<?php
/**
 * Configuration — à copier en « app/config.php » puis à remplir.
 *
 * Sur cPanel, le nom de la base et celui de l'utilisateur sont préfixés
 * par votre identifiant cPanel : par exemple « moncompte_arbre ».
 */
return [
    'db_host' => 'localhost',          // presque toujours « localhost » sur cPanel
    'db_port' => 3306,
    'db_name' => 'moncompte_arbre',    // nom complet de la base (avec le préfixe)
    'db_user' => 'moncompte_arbre',    // utilisateur MySQL (avec le préfixe)
    'db_pass' => 'MOT_DE_PASSE_MYSQL', // mot de passe de cet utilisateur MySQL
    'debug'   => false,                // true affiche les erreurs détaillées (à éviter en ligne)
];
