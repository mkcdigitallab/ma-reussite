# Cap Réussite

**Cap Réussite** est une petite application web pensée pour accompagner un élève de troisième lorsque son accompagnateur n'est pas toujours disponible.

## Ce que l'application permet

- Envoyer une demande d'aide ou une information à l'accompagnateur via WhatsApp.
- Joindre une photo d'un exercice ou d'un cahier (selon les capacités de partage du téléphone).
- Retrouver l'historique local des demandes préparées.
- Ajouter des tâches scolaires, les classer par matière et les cocher une fois terminées.
- Installer l'application sur un téléphone comme une PWA et ouvrir les pages déjà mises en cache hors connexion.

## Configuration

1. Ouvrir l'application.
2. Aller dans **Réglages**.
3. Saisir le prénom de l'élève.
4. Saisir le numéro WhatsApp de l'accompagnateur avec l'indicatif international, uniquement des chiffres (ex. Sénégal : `221771234567`).
5. Enregistrer.

## Lancer le projet

Le projet ne nécessite ni installation de dépendances ni compilation.

Pour le tester localement, servir le dossier avec un petit serveur HTTP, par exemple :

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

Pour l'installation PWA, publier le dossier sur un hébergement HTTPS, puis utiliser la commande **Ajouter à l'écran d'accueil** du navigateur.

## Limites importantes

- Les tâches, réglages et demandes sont enregistrés dans le stockage local du navigateur. Ils ne sont pas synchronisés entre plusieurs appareils.
- L'application ne déclenche pas de notification à distance sur le téléphone de l'accompagnateur. Elle prépare une conversation WhatsApp ; l'élève doit confirmer l'envoi.
- Sur certains téléphones, le partage de photo fonctionne directement. Sinon, la photo est téléchargée et doit être ajoutée manuellement dans WhatsApp.
- Pour un véritable espace accompagnateur, une synchronisation multi-appareils et des notifications automatiques, il faudra ajouter un backend et un système d'authentification.

## Fichiers principaux

- `index.html` : structure et contenus.
- `styles.css` : identité visuelle et responsive.
- `app.js` : navigation, tâches, demandes et stockage local.
- `manifest.webmanifest`, `sw.js`, `icon.svg` : installation PWA et cache hors ligne.

## Vie privée

Les données restent dans le navigateur de l'appareil. Ne pas saisir d'informations sensibles.