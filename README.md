# Évolia

Évolia est un espace privé et simple de suivi scolaire entre une élève de troisième et son accompagnateur.

## Fonctionnalités
- Connexion privée par e-mail et mot de passe.
- Bilan quotidien : travail réalisé, acquis, difficultés et objectif du lendemain.
- Demande d'aide avec photo prise directement au téléphone ou choisie dans la galerie.
- Espace accompagnateur pour consulter les bilans et demandes de l'élève.
- Photos stockées dans un bucket privé, consultables par liens temporaires.
- Interface mobile-first installable comme une PWA.

## Stack
- Frontend : HTML, CSS, JavaScript et Vite.
- Authentification, PostgreSQL et stockage : Supabase.
- Hébergement : Render Static Site.

## Configuration Supabase
Le projet Supabase de production est déjà initialisé et son schéma a été appliqué. Pour recréer Évolia dans un autre projet :

1. Exécuter `supabase/schema.sql` dans Supabase > SQL Editor.
2. Dans Authentication > Users, créer un utilisateur pour l'accompagnateur et un autre pour l'élève.
3. Copier les UUID de ces deux utilisateurs.
4. Dans SQL Editor, exécuter les deux requêtes d'association commentées à la fin de `supabase/schema.sql`, en remplaçant les UUID et les noms.
5. Dans Authentication > Settings, désactiver les inscriptions publiques si elles ne sont pas déjà désactivées. Les comptes doivent être créés par l'accompagnateur.
6. Ne jamais utiliser une clé `service_role` ou une clé `sb_secret_` dans le navigateur.

## Développement local
```bash
npm install
```

Créer un fichier `.env` à la racine :
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
``

Puis :
```bash
npm run dev
npm run build
``

La clé publishable est prévue pour le frontend. La sécurité dépend des politiques RLS, qui doivent rester activées.

## Déploiement Render
- Type : Static Site
- Branch : `feat/evolia-cloud`
- Build command : `npm install && npm run build`
- Publish directory : `dist`
- Variables d'environnement :
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

Les variables sont injectées pendant le build Vite. Toute modification doit déclencher un nouveau déploiement.
