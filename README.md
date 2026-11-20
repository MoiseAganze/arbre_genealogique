# 🌳 Arbre de famille

Application web d'arbre généalogique interactif, faite en **PHP 8.1+, MySQL / MariaDB, Tailwind CSS v4 et JavaScript** (modules ES, sans framework).

## Fonctionnalités

- **Arbre en « sablier »** : ascendants au-dessus, descendants en dessous, frères et sœurs sur la même ligne. On choisit le nombre de générations affichées.
- **Unions bien visibles** : un nœud d'union entre les conjoints, d'où partent les enfants. En cas de remariage, la personne reste au centre et ses conjoints se placent de chaque côté. Chaque union a son numéro et sa couleur.
  - trait plein : union en cours · pointillés : divorce ou séparation · trait atténué : union terminée par un décès · petits pointillés : enfant adopté ou accueilli.
- **Défunts et vivants** : photo en noir et blanc avec « † » pour les défunts ; anneau coloré animé avec un point vert pour les vivants.
- **Navigation** : déplacement à la souris ou au doigt (avec inertie), zoom à la molette ou en pinçant, double-clic pour placer une personne au centre (transition animée), mini-carte, historique des personnes visitées, recherche `Ctrl+K`, raccourcis clavier (`?` pour les afficher).
- **Ajout en 2 clics** : boutons « + » autour de chaque carte (parent, conjoint, enfant, frère/sœur). Le formulaire est court ; les détails se déplient au besoin. On peut aussi relier une personne déjà présente, et l'application signale les doublons possibles.
- **Dates souples** : `14/03/1923`, `03/1923`, `1923`, `14 mars 1923`, `vers 1920`.
- **Fiche détaillée** (5 onglets) : aperçu, vie (parcours professionnel, biographie, anecdotes), famille, galerie photos (recadrage du portrait, légendes, photo de profil), chronologie automatique.
- **Bonus** : calcul du lien de parenté (cousin issu de germains, grand-oncle, belle-sœur…), anniversaires et souvenirs à venir, statistiques de la famille.
- **Consultation publique** : toute personne qui a le lien voit l'arbre et les fiches **en lecture seule**, sans compte. Les téléphones, e-mails et notes privées restent réservés aux comptes connectés. L'administrateur peut rendre l'arbre privé dans *Administration → Réglages*.
- **Utilisateurs** : l'administrateur crée les comptes et coche les droits de chacun (Ajouter, Modifier, Supprimer). Corbeille avec restauration, et journal de toutes les modifications.
- **Thèmes** : sombre « galaxie » (voie lactée, étoiles qui scintillent, étoiles filantes) et clair « ciel d'été » (soleil rayonnant, nuages sur 3 plans, oiseaux). La bascule se fait avec une révélation circulaire.

## Installation

1. Copiez le dossier sur votre serveur (Apache, ou XAMPP / WAMP / Laragon en local), avec PHP 8.1+ et les extensions `pdo_mysql`, `gd`, `fileinfo` et `mbstring`.
2. Les dossiers `app/` et `uploads/` doivent être accessibles en écriture par PHP.
3. Ouvrez l'application dans le navigateur : l'assistant `install.php` crée la base, les tables et le compte administrateur. Il peut aussi charger une famille de démonstration.
4. C'est prêt. Pour recommencer l'installation, supprimez `app/config.php`.

> En test rapide sans Apache : `php -S 127.0.0.1:8000` à la racine du projet.

## Modifier les styles

Le CSS compilé (`assets/css/app.css`) est fourni : Node n'est **pas** nécessaire en production.
Pour modifier `src/css/input.css` :

```bash
npm install
npm run watch   # ou npm run build
```

## Structure

```
index.php, login.php, admin.php, install.php, api.php   pages + API JSON
app/            classes PHP (Database, Auth, Family, Users, ImageService…) — accès web interdit
database/       schema.sql + famille de démonstration
assets/js/      layout.js (calcul de l'arbre), tree.js (rendu, caméra), panel.js (fiche),
                forms.js, features.js (recherche, parenté, stats), background.js (ciel/galaxie)
src/css/        source Tailwind
uploads/        photos (ré-encodées, exécution de scripts interdite)
```

## Sécurité

Mots de passe hachés (`password_hash`), jeton CSRF sur chaque action, requêtes préparées (PDO), permissions vérifiées côté serveur, photos validées puis ré-encodées par GD, en-têtes de sécurité, sessions `HttpOnly` + `SameSite`.
