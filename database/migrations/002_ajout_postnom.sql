-- =====================================================================
--  Migration 002 — Ajout du champ « postnom »
--
--  À utiliser UNIQUEMENT sur un arbre déjà installé AVANT l'ajout du postnom.
--  (Les nouvelles installations ont déjà cette colonne.)
--
--  Remarque : l'application applique aussi cette migration toute seule à la
--  première visite après la mise à jour des fichiers (app/classes/Migrator.php).
--  Ce fichier sert si vous préférez la faire à la main, ou si l'utilisateur
--  MySQL n'a pas le droit ALTER.
--
--  phpMyAdmin : sélectionnez la base → onglet « SQL » → collez → Exécuter.
--  Si MySQL répond « Duplicate column name 'postnom' », la migration est
--  déjà faite : il n'y a rien d'autre à faire.
-- =====================================================================

ALTER TABLE persons
    ADD COLUMN postnom VARCHAR(120) NULL AFTER last_name;

-- Indique à l'application que la base est à jour (version 2)
INSERT INTO settings (name, value) VALUES ('db_version', '2')
    ON DUPLICATE KEY UPDATE value = '2';
