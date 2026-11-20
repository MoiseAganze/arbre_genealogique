-- =====================================================================
--  ARBRE DE FAMILLE — INSTALLATION MANUELLE (cPanel / phpMyAdmin)
--
--  1. Modifiez les 3 lignes marquées  👉  tout en bas de ce fichier :
--     nom de l'arbre, identifiant et mot de passe de l'administrateur.
--  2. Dans phpMyAdmin : sélectionnez votre base (colonne de gauche),
--     onglet « Importer », choisissez ce fichier, puis « Exécuter ».
--     (Ou collez tout le contenu dans l'onglet « SQL ».)
--
--  ⚠️ Ce script SUPPRIME les tables existantes de l'arbre s'il y en a.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS photos;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS professions;
DROP TABLE IF EXISTS union_children;
DROP TABLE IF EXISTS unions;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  Utilisateurs & permissions
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(60)  NOT NULL UNIQUE,
    display_name    VARCHAR(120) NOT NULL,
    email           VARCHAR(190) NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('admin','member') NOT NULL DEFAULT 'member',
    can_add         TINYINT(1) NOT NULL DEFAULT 0,
    can_edit        TINYINT(1) NOT NULL DEFAULT 0,
    can_delete      TINYINT(1) NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    person_id       INT UNSIGNED NULL COMMENT 'La personne de l''arbre qui correspond à ce compte',
    last_login_at   DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Réglages généraux (titre de la famille, personne racine…)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
    name    VARCHAR(60) PRIMARY KEY,
    value   TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Personnes
-- ---------------------------------------------------------------------
CREATE TABLE persons (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_names     VARCHAR(160) NOT NULL,
    last_name       VARCHAR(120) NOT NULL DEFAULT '',
    postnom         VARCHAR(120) NULL,
    birth_name      VARCHAR(120) NULL COMMENT 'Nom de naissance / de jeune fille',
    nickname        VARCHAR(80)  NULL,
    gender          ENUM('M','F','U') NOT NULL DEFAULT 'U',
    is_living       TINYINT(1) NOT NULL DEFAULT 1,

    birth_date      VARCHAR(10) NULL,
    birth_approx    TINYINT(1) NOT NULL DEFAULT 0,
    birth_place     VARCHAR(190) NULL,
    death_date      VARCHAR(10) NULL,
    death_approx    TINYINT(1) NOT NULL DEFAULT 0,
    death_place     VARCHAR(190) NULL,
    death_cause     VARCHAR(190) NULL,
    burial_place    VARCHAR(190) NULL,

    occupation      VARCHAR(160) NULL COMMENT 'Métier principal affiché sur la carte',
    nationality     VARCHAR(120) NULL,
    religion        VARCHAR(120) NULL,
    education       VARCHAR(255) NULL,
    residence       VARCHAR(255) NULL COMMENT 'Lieux de vie',
    hobbies         VARCHAR(255) NULL,
    phone           VARCHAR(60)  NULL,
    email           VARCHAR(190) NULL,
    biography       TEXT NULL,
    anecdotes       TEXT NULL,
    notes           TEXT NULL,

    photo_id        INT UNSIGNED NULL,

    created_by      INT UNSIGNED NULL,
    updated_by      INT UNSIGNED NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME NULL,
    deleted_by      INT UNSIGNED NULL,

    INDEX idx_persons_name (last_name, first_names),
    INDEX idx_persons_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Unions (couples). Un parent seul = union avec un seul partenaire.
-- ---------------------------------------------------------------------
CREATE TABLE unions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    partner1_id     INT UNSIGNED NULL,
    partner2_id     INT UNSIGNED NULL,
    type            ENUM('mariage','pacs','union_libre','fiancailles','religieux','coutumier','inconnu') NOT NULL DEFAULT 'mariage',
    status          ENUM('en_cours','divorce','separe','veuvage','annule') NOT NULL DEFAULT 'en_cours',
    start_date      VARCHAR(10) NULL,
    start_approx    TINYINT(1) NOT NULL DEFAULT 0,
    start_place     VARCHAR(190) NULL,
    end_date        VARCHAR(10) NULL,
    end_approx      TINYINT(1) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_unions_p1 (partner1_id),
    INDEX idx_unions_p2 (partner2_id),
    CONSTRAINT fk_unions_p1 FOREIGN KEY (partner1_id) REFERENCES persons(id) ON DELETE SET NULL,
    CONSTRAINT fk_unions_p2 FOREIGN KEY (partner2_id) REFERENCES persons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE union_children (
    union_id        INT UNSIGNED NOT NULL,
    child_id        INT UNSIGNED NOT NULL,
    relation        ENUM('biologique','adoptif','accueil','inconnu') NOT NULL DEFAULT 'biologique',
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (union_id, child_id),
    INDEX idx_uc_child (child_id),
    CONSTRAINT fk_uc_union FOREIGN KEY (union_id) REFERENCES unions(id) ON DELETE CASCADE,
    CONSTRAINT fk_uc_child FOREIGN KEY (child_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Détails de vie
-- ---------------------------------------------------------------------
CREATE TABLE professions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    person_id       INT UNSIGNED NOT NULL,
    title           VARCHAR(160) NOT NULL,
    employer        VARCHAR(160) NULL,
    place           VARCHAR(160) NULL,
    start_year      SMALLINT NULL,
    end_year        SMALLINT NULL,
    description     TEXT NULL,
    INDEX idx_prof_person (person_id),
    CONSTRAINT fk_prof_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    person_id       INT UNSIGNED NOT NULL,
    type            VARCHAR(40) NOT NULL DEFAULT 'autre',
    title           VARCHAR(190) NOT NULL,
    event_date      VARCHAR(10) NULL,
    date_approx     TINYINT(1) NOT NULL DEFAULT 0,
    place           VARCHAR(190) NULL,
    description     TEXT NULL,
    INDEX idx_events_person (person_id),
    CONSTRAINT fk_events_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE photos (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    person_id       INT UNSIGNED NOT NULL,
    file_name       VARCHAR(120) NOT NULL,
    thumb_name      VARCHAR(120) NOT NULL,
    caption         VARCHAR(255) NULL,
    year            SMALLINT NULL,
    created_by      INT UNSIGNED NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_photos_person (person_id),
    CONSTRAINT fk_photos_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Journal des modifications
-- ---------------------------------------------------------------------
CREATE TABLE activity_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NULL,
    action          VARCHAR(30) NOT NULL,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       INT UNSIGNED NULL,
    summary         VARCHAR(255) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Réglages de départ
-- ---------------------------------------------------------------------
INSERT INTO settings (name, value) VALUES
    ('family_name', 'Famille Dupont'),            -- 👉 1. le nom de votre arbre
    ('public_view', '1'),                         -- 1 = visible par tous en lecture seule, 0 = privé
    ('db_version', '2');                          -- version du schéma (ne pas modifier)

-- ---------------------------------------------------------------------
--  Compte administrateur
--  Le mot de passe est provisoirement stocké en SHA-256 : l'application
--  le remplace automatiquement par un hachage sécurisé (bcrypt) dès la
--  première connexion. Choisissez au moins 8 caractères.
-- ---------------------------------------------------------------------
INSERT INTO users (username, display_name, password_hash, role, can_add, can_edit, can_delete, is_active)
VALUES (
    'admin',                                      -- 👉 2. identifiant de connexion
    'Administrateur',                             --       nom affiché
    SHA2('ChoisissezUnMotDePasse', 256),          -- 👉 3. votre mot de passe (entre les apostrophes)
    'admin', 1, 1, 1, 1
);
