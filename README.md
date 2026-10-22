# Mon Entraînement

Web app (PWA) installable sur iPhone pour planifier ses séances de **course à pied**, **basket** et **renfo**, avec des **suggestions de séances de course** calculées à partir de ses résultats (temps, distance, fréquence cardiaque), importés depuis **Strava** ou saisis à la main.

## Fonctionnalités

- **Calendrier** mensuel : séances prévues (pastille vide) et réalisées (pastille pleine)
- **Types de course** : EF, footing classique, fractionné/VMA, seuil, sortie longue, récupération, compétition
- **Résultats** : distance, durée, allure, FC moyenne/max, ressenti (RPE)
- **Conseils** :
  - séance recommandée selon ta fatigue récente (basket compris), la dernière séance de qualité et la sortie longue de la semaine
  - allures d'entraînement et temps estimés (5 km → marathon) à partir de ta meilleure perf récente (formule de Riegel)
  - zones cardiaques (FC max saisie, relevée ou estimée ; méthode de Karvonen si FC repos renseignée)
  - alertes : EF trop rapides, hausse de volume > 10 %, trop de séances intenses
- **Stats** : km par semaine, allure et FC moyennes
- **Strava** : import automatique des courses, matchs de basket et séances de renfo
- **Hors ligne** et **sauvegarde** JSON (export/import)

Les données restent sur ton téléphone (localStorage). Aucun serveur.

## Installation sur iPhone

1. Pousse ce dépôt sur GitHub, puis active **Settings › Pages › Deploy from a branch › `main` / root**.
2. Ouvre `https://<ton-pseudo>.github.io/mon-entrainement/` dans **Safari** sur l'iPhone.
3. Bouton **Partager** › **Sur l'écran d'accueil**.

## Connexion Strava

1. Va sur <https://www.strava.com/settings/api> et crée une application.
   - *Site web* : `https://<ton-pseudo>.github.io/mon-entrainement/`
   - *Domaine de rappel d'autorisation* : `<ton-pseudo>.github.io`
2. Dans l'app : **Réglages › Strava › Configurer**, colle l'ID client et le secret client.
3. Appuie sur **Se connecter à Strava**.

> Ne mets jamais ton secret client dans le code ni sur GitHub : il est saisi uniquement dans l'app.

Si, après la connexion, l'app installée ne se voit pas connectée (iOS sépare le stockage de Safari et de l'app sur l'écran d'accueil), copie le code affiché et colle-le dans **Refresh token**.

Si ta montre est une **Garmin** : active la synchro Garmin Connect → Strava, et tout arrivera automatiquement.

## Développement

Pas de build : HTML/CSS/JS pur.

```
index.html          structure
styles.css          styles (clair/sombre)
js/storage.js       stockage + utilitaires
js/coach.js         moteur de suggestions
js/strava.js        OAuth + import Strava
js/app.js           interface
sw.js               cache hors ligne (incrémenter VERSION à chaque mise à jour)
```

Pour tester sur PC : `python -m http.server` dans le dossier, ou l'extension VS Code « Live Server ».
