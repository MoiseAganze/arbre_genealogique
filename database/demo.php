<?php
declare(strict_types=1);

/**
 * Famille de démonstration (fictive) : 4 à 5 générations, remariages,
 * divorce, veuvage, adoption, défunts et vivants.
 * Retourne l'id de la personne racine.
 */
return function (PDO $pdo): int {
    $ids = [];
    $person = function (string $key, array $d) use ($pdo, &$ids): int {
        $d += [
            'last_name' => '', 'gender' => 'U', 'is_living' => 1, 'birth_date' => null, 'birth_place' => null,
            'death_date' => null, 'death_place' => null, 'occupation' => null, 'biography' => null,
            'birth_name' => null, 'nickname' => null, 'residence' => null, 'hobbies' => null,
            'education' => null, 'nationality' => 'Française', 'anecdotes' => null, 'death_cause' => null,
            'birth_approx' => 0,
        ];
        $cols = array_keys($d);
        $st = $pdo->prepare('INSERT INTO persons (' . implode(',', $cols) . ') VALUES (:' . implode(',:', $cols) . ')');
        $st->execute($d);
        return $ids[$key] = (int) $pdo->lastInsertId();
    };
    $union = function (string $a, ?string $b, array $d = [], array $children = []) use ($pdo, &$ids): int {
        $d += ['type' => 'mariage', 'status' => 'en_cours', 'start_date' => null, 'start_place' => null, 'end_date' => null];
        $st = $pdo->prepare('INSERT INTO unions (partner1_id, partner2_id, type, status, start_date, start_place, end_date) VALUES (?,?,?,?,?,?,?)');
        $st->execute([$ids[$a], $b ? $ids[$b] : null, $d['type'], $d['status'], $d['start_date'], $d['start_place'], $d['end_date']]);
        $uid = (int) $pdo->lastInsertId();
        $i = 0;
        foreach ($children as $child) {
            [$key, $rel] = is_array($child) ? $child : [$child, 'biologique'];
            $pdo->prepare('INSERT INTO union_children (union_id, child_id, relation, sort_order) VALUES (?,?,?,?)')
                ->execute([$uid, $ids[$key], $rel, ++$i]);
        }
        return $uid;
    };
    $job = function (string $key, string $title, ?int $from, ?int $to, ?string $employer = null, ?string $place = null) use ($pdo, &$ids): void {
        $pdo->prepare('INSERT INTO professions (person_id, title, employer, place, start_year, end_year) VALUES (?,?,?,?,?,?)')
            ->execute([$ids[$key], $title, $employer, $place, $from, $to]);
    };
    $event = function (string $key, string $type, string $title, ?string $date, ?string $place = null, ?string $desc = null) use ($pdo, &$ids): void {
        $pdo->prepare('INSERT INTO events (person_id, type, title, event_date, place, description) VALUES (?,?,?,?,?,?)')
            ->execute([$ids[$key], $type, $title, $date, $place, $desc]);
    };

    // --- Génération 0 : arrière-grands-parents ---------------------------
    $person('louis', ['first_names' => 'Louis Auguste', 'last_name' => 'Laurent', 'gender' => 'M', 'is_living' => 0, 'birth_date' => '1880', 'birth_approx' => 1, 'birth_place' => 'Saint-Flour', 'death_date' => '1950-02-11', 'death_place' => 'Saint-Flour', 'occupation' => 'Agriculteur']);
    $person('jeanne', ['first_names' => 'Jeanne', 'last_name' => 'Laurent', 'birth_name' => 'Morel', 'gender' => 'F', 'is_living' => 0, 'birth_date' => '1885-06-03', 'birth_place' => 'Murat', 'death_date' => '1960-12-24', 'occupation' => 'Fermière']);
    $person('emile', ['first_names' => 'Émile', 'last_name' => 'Petit', 'gender' => 'M', 'is_living' => 0, 'birth_date' => '1882-09-14', 'birth_place' => 'Clermont-Ferrand', 'death_date' => '1944-08-20', 'death_place' => 'Clermont-Ferrand', 'death_cause' => 'Bombardement', 'occupation' => 'Cheminot']);
    $person('rose', ['first_names' => 'Rose', 'last_name' => 'Petit', 'birth_name' => 'Lambert', 'gender' => 'F', 'is_living' => 0, 'birth_date' => '1888-04-02', 'death_date' => '1971-03-30', 'occupation' => 'Blanchisseuse']);

    // --- Génération 1 -----------------------------------------------------
    $person('joseph', ['first_names' => 'Joseph Marcel', 'last_name' => 'Laurent', 'nickname' => 'Pépé Jo', 'gender' => 'M', 'is_living' => 0, 'birth_date' => '1910-03-21', 'birth_place' => 'Saint-Flour', 'death_date' => '1985-11-02', 'death_place' => 'Aurillac', 'occupation' => 'Forgeron', 'residence' => 'Saint-Flour, puis Aurillac', 'hobbies' => 'Pêche à la truite, accordéon',
        'biography' => "Fils aîné de Louis et Jeanne, Joseph apprend le métier de forgeron dès 14 ans chez son oncle.\n\nMobilisé en 1939, il est fait prisonnier en 1940 et passe quatre ans dans une ferme en Allemagne. À son retour, il ouvre sa propre forge à Aurillac, qui deviendra le point de rendez-vous de tout le quartier.",
        'anecdotes' => "Il jouait de l'accordéon à chaque mariage de la famille, même à 70 ans passés."]);
    $person('marguerite', ['first_names' => 'Marguerite', 'last_name' => 'Laurent', 'birth_name' => 'Petit', 'nickname' => 'Mémé Margot', 'gender' => 'F', 'is_living' => 0, 'birth_date' => '1913-07-08', 'birth_place' => 'Clermont-Ferrand', 'death_date' => '1990-01-15', 'death_place' => 'Aurillac', 'occupation' => 'Couturière',
        'biography' => "Couturière réputée, elle a confectionné les robes de mariée de presque toutes les femmes de la famille. Sa machine à coudre Singer est toujours conservée par sa petite-fille Sophie."]);

    // --- Génération 2 -----------------------------------------------------
    $person('henri', ['first_names' => 'Henri', 'last_name' => 'Laurent', 'gender' => 'M', 'is_living' => 0, 'birth_date' => '1935-05-12', 'birth_place' => 'Aurillac', 'death_date' => '2010-09-30', 'death_place' => 'Lyon', 'occupation' => 'Instituteur', 'education' => 'École normale de Clermont-Ferrand',
        'biography' => "Instituteur pendant 35 ans, Henri a marqué des générations d'élèves. Veuf très jeune, il élève seul ses deux premiers enfants avant de rencontrer Claire, avec qui il fonde une seconde famille."]);
    $person('simone', ['first_names' => 'Simone', 'last_name' => 'Laurent', 'birth_name' => 'Garnier', 'gender' => 'F', 'is_living' => 0, 'birth_date' => '1936-02-19', 'death_date' => '1962-04-07', 'death_cause' => 'Maladie', 'occupation' => 'Secrétaire']);
    $person('claire', ['first_names' => 'Claire', 'last_name' => 'Laurent', 'birth_name' => 'Dubois', 'gender' => 'F', 'is_living' => 1, 'birth_date' => '1940-10-01', 'birth_place' => 'Lyon', 'occupation' => 'Pharmacienne', 'residence' => 'Lyon', 'hobbies' => 'Jardinage, chorale']);
    $person('lucie', ['first_names' => 'Lucie', 'last_name' => 'Roux', 'birth_name' => 'Laurent', 'gender' => 'F', 'is_living' => 0, 'birth_date' => '1938-12-05', 'death_date' => '2019-06-18', 'occupation' => 'Infirmière', 'residence' => 'Marseille']);
    $person('bernard', ['first_names' => 'Bernard', 'last_name' => 'Roux', 'gender' => 'M', 'is_living' => 0, 'birth_date' => '1935', 'death_date' => '2001-03-03', 'occupation' => 'Marin pêcheur']);
    $person('paul', ['first_names' => 'Paul', 'last_name' => 'Laurent', 'gender' => 'M', 'is_living' => 1, 'birth_date' => '1942-08-15', 'birth_place' => 'Aurillac', 'occupation' => 'Mécanicien', 'residence' => 'Aurillac', 'hobbies' => 'Voitures anciennes']);

    // --- Génération 3 -----------------------------------------------------
    $person('michel', ['first_names' => 'Michel', 'last_name' => 'Laurent', 'gender' => 'M', 'birth_date' => '1958-01-23', 'birth_place' => 'Lyon', 'occupation' => 'Architecte', 'residence' => 'Bordeaux']);
    $person('anne', ['first_names' => 'Anne', 'last_name' => 'Laurent', 'gender' => 'F', 'birth_date' => '1960-11-11', 'birth_place' => 'Lyon', 'occupation' => 'Professeure de musique']);
    $person('thomas', ['first_names' => 'Thomas', 'last_name' => 'Laurent', 'gender' => 'M', 'birth_date' => '1967-04-04', 'birth_place' => 'Lyon', 'occupation' => 'Médecin urgentiste', 'residence' => 'Dakar, puis Paris']);
    $person('sophie', ['first_names' => 'Sophie', 'last_name' => 'Laurent', 'gender' => 'F', 'birth_date' => '1970-09-27', 'birth_place' => 'Lyon', 'occupation' => 'Créatrice de mode', 'hobbies' => 'Couture, photographie']);
    $person('julien', ['first_names' => 'Julien', 'last_name' => 'Roux', 'gender' => 'M', 'birth_date' => '1962-07-14', 'birth_place' => 'Marseille', 'occupation' => 'Capitaine de navire']);
    $person('isabelle', ['first_names' => 'Isabelle', 'last_name' => 'Fournier', 'gender' => 'F', 'birth_date' => '1960-05-30', 'occupation' => 'Journaliste']);
    $person('nadia', ['first_names' => 'Nadia', 'last_name' => 'Benali', 'gender' => 'F', 'birth_date' => '1965-02-14', 'birth_place' => 'Oran', 'nationality' => 'Franco-algérienne', 'occupation' => 'Avocate']);
    $person('aicha', ['first_names' => 'Aïcha', 'last_name' => 'Diallo', 'gender' => 'F', 'birth_date' => '1970-12-02', 'birth_place' => 'Dakar', 'nationality' => 'Sénégalaise', 'occupation' => 'Ingénieure agronome']);
    $person('marc', ['first_names' => 'Marc', 'last_name' => 'Leroy', 'gender' => 'M', 'birth_date' => '1968-03-09', 'occupation' => 'Photographe']);

    // --- Génération 4 -----------------------------------------------------
    $person('camille', ['first_names' => 'Camille', 'last_name' => 'Laurent', 'gender' => 'F', 'birth_date' => '1985-06-21', 'birth_place' => 'Bordeaux', 'occupation' => 'Développeuse web']);
    $person('hugo', ['first_names' => 'Hugo', 'last_name' => 'Laurent', 'gender' => 'M', 'birth_date' => '1995-10-10', 'occupation' => 'Chef cuisinier']);
    $person('lea', ['first_names' => 'Léa', 'last_name' => 'Laurent', 'gender' => 'F', 'birth_date' => '1998-01-05', 'occupation' => 'Étudiante en médecine']);
    $person('ines', ['first_names' => 'Inès', 'last_name' => 'Laurent', 'gender' => 'F', 'birth_date' => '2000-08-08', 'birth_place' => 'Dakar', 'occupation' => 'Architecte d\'intérieur']);
    $person('noah', ['first_names' => 'Noah', 'last_name' => 'Laurent', 'gender' => 'M', 'birth_date' => '2005-03-17', 'occupation' => 'Lycéen']);
    $person('emma', ['first_names' => 'Emma', 'last_name' => 'Leroy', 'gender' => 'F', 'birth_date' => '2003-11-29']);
    $person('yanis', ['first_names' => 'Yanis', 'last_name' => 'Martin', 'gender' => 'M', 'birth_date' => '1984-04-12', 'occupation' => 'Graphiste']);
    $person('jules', ['first_names' => 'Jules', 'last_name' => 'Martin', 'gender' => 'M', 'birth_date' => '2015-09-01']);

    // --- Unions -----------------------------------------------------------
    $union('louis', 'jeanne', ['start_date' => '1907', 'start_place' => 'Saint-Flour', 'status' => 'veuvage'], ['joseph']);
    $union('emile', 'rose', ['start_date' => '1910-05-14', 'status' => 'veuvage'], ['marguerite']);
    $union('joseph', 'marguerite', ['start_date' => '1934-06-16', 'start_place' => 'Aurillac', 'status' => 'veuvage'], ['henri', 'lucie', 'paul']);
    $union('simone', 'henri', ['start_date' => '1957-04-20', 'start_place' => 'Lyon', 'status' => 'veuvage', 'end_date' => '1962-04-07'], ['michel', 'anne']);
    $union('henri', 'claire', ['start_date' => '1965-09-04', 'start_place' => 'Lyon', 'status' => 'veuvage', 'end_date' => '2010-09-30'], ['thomas', 'sophie']);
    $union('lucie', 'bernard', ['start_date' => '1960-08-27', 'start_place' => 'Marseille', 'status' => 'veuvage'], ['julien']);
    $union('isabelle', 'michel', ['start_date' => '1983-07-02', 'status' => 'divorce', 'end_date' => '1990'], ['camille']);
    $union('michel', 'nadia', ['start_date' => '1993-05-22', 'start_place' => 'Bordeaux'], ['hugo', 'lea']);
    $union('thomas', 'aicha', ['start_date' => '1998-12-19', 'start_place' => 'Dakar', 'type' => 'mariage'], ['ines', ['noah', 'adoptif']]);
    $union('sophie', 'marc', ['start_date' => '2002', 'type' => 'pacs', 'status' => 'separe'], ['emma']);
    $union('camille', 'yanis', ['start_date' => '2013-06-08', 'type' => 'union_libre'], ['jules']);

    // --- Métiers & événements ---------------------------------------------
    $job('joseph', 'Apprenti forgeron', 1924, 1930, 'Forge Laurent (oncle Pierre)', 'Saint-Flour');
    $job('joseph', 'Soldat — 139e RI', 1939, 1940, null, 'Lorraine');
    $job('joseph', 'Forgeron à son compte', 1946, 1975, null, 'Aurillac');
    $job('henri', 'Instituteur', 1956, 1991, 'École Jean-Macé', 'Lyon');
    $job('thomas', 'Médecin humanitaire', 1995, 2003, 'Médecins du Monde', 'Dakar');
    $job('thomas', 'Médecin urgentiste', 2004, null, 'Hôpital Lariboisière', 'Paris');

    $event('joseph', 'militaire', 'Mobilisation', '1939-09-02', 'Aurillac');
    $event('joseph', 'militaire', 'Fait prisonnier', '1940-06', 'Lorraine', 'Envoyé dans un Stalag puis affecté à une ferme en Bavière.');
    $event('joseph', 'demenagement', 'Retour de captivité', '1945-05', 'Aurillac');
    $event('joseph', 'travail', 'Ouverture de la forge', '1946', 'Aurillac');
    $event('henri', 'diplome', 'Diplôme de l\'École normale', '1956-06', 'Clermont-Ferrand');
    $event('henri', 'distinction', 'Palmes académiques', '1988');
    $event('thomas', 'voyage', 'Départ pour le Sénégal', '1995-01', 'Dakar');

    return $ids['joseph'];
};
