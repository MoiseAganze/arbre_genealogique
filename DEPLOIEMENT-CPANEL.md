# Déployer l'arbre sur cPanel (sans install.php)

Prévoyez environ 15 minutes. Il vous faut :
- le dossier du projet `arbre_famille` ;
- un accès à votre **cPanel**.

---

## 1. Vérifier la version de PHP

cPanel → **Sélectionner une version de PHP** (*Select PHP Version*) ou **MultiPHP Manager**.

- Choisissez **PHP 8.1 ou plus récent** (8.2 / 8.3 conseillé) pour le domaine.
- Dans l'onglet *Extensions*, cochez si besoin : **`pdo_mysql`**, **`gd`**, **`fileinfo`** et **`mbstring`**. Elles sont généralement déjà actives.
- Facultatif (*Options* ou *MultiPHP INI Editor*) : `upload_max_filesize = 16M` et `post_max_size = 20M` pour les photos.

## 2. Créer la base de données

cPanel → **Assistant de base de données MySQL** (*MySQL Database Wizard*) :

1. **Nom de la base** : par exemple `arbre`. cPanel ajoute votre préfixe et la base devient **`moncompte_arbre`** : notez ce nom complet.
2. **Utilisateur** : par exemple `arbre`, ce qui donne **`moncompte_arbre`**. Utilisez le générateur de mot de passe et **notez-le**.
3. **Privilèges** : cochez **TOUS LES PRIVILÈGES**, puis validez.

> ⚠️ Oublier l'étape 3 est la cause d'erreur la plus fréquente : l'utilisateur doit être *ajouté à la base*.

## 3. Créer les tables et votre compte administrateur

1. Sur votre ordinateur, ouvrez **`database/install-cpanel.sql`** avec un éditeur de texte (Bloc-notes, VS Code…).
2. Tout en bas, modifiez les 3 lignes marquées 👉 :
   ```sql
   ('family_name', 'Famille Dupont'),       -- le nom de votre arbre
   'admin',                                 -- votre identifiant
   SHA2('ChoisissezUnMotDePasse', 256),     -- votre mot de passe (8 caractères min.)
   ```
   Le mot de passe est stocké provisoirement en SHA-256. **Dès votre première connexion**, l'application le remplace automatiquement par un hachage sécurisé (bcrypt).
3. cPanel → **phpMyAdmin** → cliquez sur votre base `moncompte_arbre` dans la colonne de gauche → onglet **Importer** → choisissez le fichier → **Importer** (ou *Exécuter*).
4. *Facultatif* : importez aussi **`database/demo.sql`** de la même façon pour avoir une famille fictive de démonstration (29 personnes).

## 4. Envoyer les fichiers

**Fichiers à envoyer** : tout le projet, **sauf** `node_modules/`, `src/`, `.claude/`, `package.json`, `package-lock.json`, `app/config.php` (s'il existe sur votre ordinateur) et le contenu de `uploads/` (gardez seulement `uploads/.htaccess`).
**Supprimez aussi `install.php`** : il n'est pas utile pour une installation manuelle.

Le plus simple : compressez ces fichiers en `.zip` sur votre ordinateur, puis, dans cPanel → **Gestionnaire de fichiers** (*File Manager*) :

- **Arbre à la racine du site** (`https://mondomaine.fr`) : dans `public_html`, envoyez le zip puis *Extraire*. Les fichiers (`index.php`, `app/`, `assets/`…) doivent se trouver directement dans `public_html`.
- **Arbre dans un sous-dossier** (`https://mondomaine.fr/famille`) : créez le dossier `public_html/famille` et extrayez-y le zip.
- **Sous-domaine** (`https://famille.mondomaine.fr`) : cPanel → *Domaines* → créez le sous-domaine, puis extrayez le zip dans le dossier qu'il indique.

Supprimez ensuite le fichier `.zip` du serveur.

## 5. Créer le fichier de configuration

Dans le Gestionnaire de fichiers, dossier **`app/`** :

1. Clic droit sur **`config.sample.php`** → *Copier* → nommez la copie **`config.php`** (dans le même dossier `app/`).
2. Clic droit sur `config.php` → *Modifier*, puis renseignez :
   ```php
   'db_host' => 'localhost',
   'db_port' => 3306,
   'db_name' => 'moncompte_arbre',      // nom complet de la base
   'db_user' => 'moncompte_arbre',      // utilisateur complet
   'db_pass' => 'le mot de passe noté à l'étape 2',
   'debug'   => false,
   ```
3. Enregistrez.

## 6. Permissions

Normalement rien à faire : les dossiers en **755** et les fichiers en **644** conviennent (cPanel fait tourner PHP sous votre compte).
Si l'envoi de photos échoue, mettez le dossier **`uploads/`** en **755** (clic droit → *Modifier les autorisations*). En dernier recours seulement, essayez **775**.

## 7. HTTPS

cPanel → **SSL/TLS Status** → lancez **AutoSSL** pour votre domaine (gratuit).
Une fois le cadenas actif, ouvrez **`.htaccess`** (à la racine de l'arbre ; activez *Afficher les fichiers cachés* dans les paramètres du Gestionnaire) et décommentez les 3 lignes « Forcer HTTPS ».

## 8. Première connexion

1. Ouvrez votre site : l'arbre s'affiche (vide, ou avec la démo).
2. **Se connecter** avec l'identifiant et le mot de passe choisis à l'étape 3.
3. **Administration** → *Utilisateurs* : créez les comptes des membres de la famille et cochez leurs droits.
4. **Administration** → *Réglages* : copiez le lien de partage. La consultation publique en lecture seule y est activable ou désactivable.

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| Page « Configuration manquante » | `app/config.php` n'existe pas ou est mal nommé (étape 5). |
| Page « Connexion à la base de données impossible » | Vérifiez le nom de la base, l'utilisateur (avec le préfixe `moncompte_`), le mot de passe, et que l'utilisateur est bien **ajouté à la base** avec tous les privilèges (étape 2). Pour voir l'erreur exacte, mettez temporairement `'debug' => true`. |
| « Identifiant ou mot de passe incorrect » | Ré-exécutez dans phpMyAdmin (onglet SQL) : `UPDATE users SET password_hash = SHA2('NouveauMotDePasse', 256) WHERE username = 'admin';` |
| Erreur 500 | Vérifiez la version de PHP (≥ 8.1, étape 1). Consultez cPanel → *Erreurs* (*Errors*) ou le fichier `error_log` dans le dossier du site. |
| Les photos ne s'envoient pas | Extensions `gd` et `fileinfo` activées (étape 1), dossier `uploads/` en 755, et taille d'envoi suffisante. |
| Page blanche ou styles absents | Vérifiez que le dossier `assets/` a bien été envoyé, puis videz le cache du navigateur. |

## Mettre à jour plus tard

Envoyez les nouveaux fichiers **sans écraser** `app/config.php` ni le dossier `uploads/` (vos photos).
La base se met à jour **toute seule** à la première visite qui suit l'envoi : par exemple, la colonne « postnom » est ajoutée automatiquement aux arbres déjà installés.
Pour faire la mise à jour à la main (ou si l'utilisateur MySQL n'a pas le droit `ALTER`), exécutez dans phpMyAdmin, onglet *SQL*, les fichiers de **`database/migrations/`** dans l'ordre (par exemple `002_ajout_postnom.sql`).
Ne ré-importez **jamais** `install-cpanel.sql` sur une base en service : ce script vide toutes les tables.

## Sauvegarder

- **Base** : phpMyAdmin → votre base → *Exporter* → *Exécuter*.
- **Photos** : téléchargez le dossier `uploads/` (clic droit → *Compresser*, puis téléchargez le zip).
- Ou plus simplement : cPanel → **Sauvegarde** (*Backup*).
