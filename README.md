# Évolia

Évolia est un espace privé de suivi scolaire entre un élève et son accompagnateur.

## Fonctionnalités
- Connexion par e-mail et mot de passe (comptes créés par l'accompagnateur).
- Bilans quotidiens synchronisés en ligne.
- Demandes d'aide avec photos prises par l'appareil ou choisies dans la galerie.
- Espace accompagnateur protégé pour consulter les bilans, difficultés, objectifs et photos privées.
- Interface mobile-first installable comme une PWA.

## Stack
- Frontend : HTML, CSS, JavaScript, Vite.
- Authentification, base PostgreSQL et stockage privé : Supabase.
- Hébergement : Render Static Site.

## Configuration locale
1. `npm install`
2. Définir `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `npm run dev`

La clé publishable peut être utilisée dans le navigateur uniquement avec les politiques RLS de `supabase/schema.sql` activées. Ne jamais exposer une clé secret ou service_role.

## Configuration Supabase
1. Créer un projet Supabase.
2. Exécuter `supabase/schema.sql` dans SQL Editor.
3. Dans Authentication > Users, créer le compte accompagnateur et le compte élève.
4. Copier leurs UUID, puis exécuter les deux UPDATE commentés à la fin du SQL pour attribuer les rôles et relier l'élève à l'accompagnateur.
5. Désactiver l'inscription publique.
6. Renseigner l'URL du projet et la clé publishable dans les variables d'environnement Render.

## Déploiement Render
- Type : Static Site
- Branch : `feat/evolia-cloud`
- Build command : `npm install && npm run build`
- Publish directory : `dist`
- Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

Les photos sont conservées dans un bucket privé. Les liens de consultation sont signés temporairement par le client authentifié.
