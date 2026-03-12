# Suivi de Réadaptation Exosquelettes - CRR-Sion

Cette application de bureau a été développée pour le Centre Romand de Réadaptation de Sion (CRR) (Suisse). Elle permet aux professionnels de santé (MSP) d'assurer le suivi des patients utilisant des exosquelettes lors de leurs séances de réadaptation professionnelle.

> **Remarque importantes :** Cette web app a été développée dans le cadre de l'unité `Innovation crunch time` de la HEIG-VD. Le développement a été réalisé dans un délai très court (moins de 2 jours) avec l'aide de Gemini 3.1 Pro. Ce programme peut donc contenir des instabilités et mériterait un refactoring :).


## Fonctionnalités Principales
* **Agenda interactif :** Planification visuelle des séances de la semaine.
* **Suivi personnalisé :** Historique détaillé par patient (modèle d'exo, niveau d'assistance, douleur, fatigue).
* **Module d'exercices :** Ajout d'exercices spécifiques (poids, temps) avec autocomplétion intelligente basée sur l'historique du patient.
* **Analyse croisée :** Génération automatique de graphiques montrant l'évolution de l'effort du patient face au niveau d'assistance de la machine.
* **Génération de rapports :** Exportation PDF d'une séance unique ou du parcours de réadaptation complet.
* **Base de données locale :** Sauvegarde automatique dans un fichier JSON local.

---

## Guide d'installation pour les Utilisateurs (MSP)

L'application ne nécessite aucune installation complexe ni de droits d'administrateur.

1. **Récupérer l'application :** Téléchargez le dossier compressé (ex: `App-Exosquelette-CRR.zip`) fourni par l'équipe technique.
2. **Extraire le dossier :** Faites un **clic droit** sur le fichier `.zip` et choisissez **"Extraire tout..."**. *(Attention : Ne lancez jamais l'application directement depuis le fichier ZIP, les sauvegardes ne fonctionneraient pas).*
3. **Placer le dossier :** Déplacez le dossier extrait (nommé `win-unpacked`) dans un endroit sûr de votre ordinateur (ex: vos *Documents*). Vous pouvez renommer ce dossier en `App-Exosquelettes` si vous le souhaitez mais c'est facultatif.
4. **Créer un raccourci :** À l'intérieur du dossier, trouvez le fichier **`Suivi Exosquelettes CRR.exe`** (il porte le logo du CRR et peut être suivi d'une version ex: ... V1.0.exe). Faites un clic droit dessus > **afficher d'autres options** > **créer un raccourci** ensuite copier le raccourci sur votre Bureau.
5. **Utilisation :** Double-cliquez sur le raccourci sur votre bureau pour lancer l'application.

> **Important concernant vos données :** > Dès la première ouverture, un dossier nommé `log_exo_crr` va se créer automatiquement juste à côté du fichier `.exe` (dans votre dossier *Documents*). Ce dossier contient le fichier `base_patients.json`. **C'est votre base de données.** Ne la supprimez pas. Vous pouvez copier ce dossier sur une clé USB pour sauvegarder vos données ou les transmettre.

---

## Guide d'installation pour les Développeurs

L'application est construite avec des technologies Web (HTML/CSS/JS) encapsulées via **Electron.js**.

### Prérequis
* [Node.js](https://nodejs.org/) installé sur votre machine.

### Installation de l'environnement de développement
1. Ouvrez un terminal et naviguez vers le dossier source du projet.
2. Installez les dépendances nécessaires (Electron et Electron-Builder) en tapant :
   ```bash
   npm install
    ```

### Lancer l'application en mode développement

Pour tester l'application en direct (avec rechargement à chaque fermeture) :

```bash
npm start
```

*Note : En mode développement, le dossier de base de données `log_exo_crr` se créera à la racine du projet.*

### Compiler l'application pour la production

Pour générer la version finale à distribuer aux utilisateurs :

```bash
npm run build
```

L'outil `electron-builder` va compiler le projet (format "Directory" pour un lancement rapide sous Windows).
Le résultat final se trouvera dans le dossier **`dist/win-unpacked`**. C'est ce dossier complet qu'il faut distribuer aux utilisateurs (généralement en le compressant en `.zip`).

---

## Architecture des fichiers

* `main.js` : Le main Electron (gestion de la fenêtre système, sauvegarde du JSON, génération du PDF).
* `index.html` : La structure de l'interface utilisateur.
* `styles.css` : Le design et la mise en page.
* `renderer.js` : La logique applicative (gestion du calendrier, interactions, calcul des graphiques).
* `chart.js` : La librairie externe (téléchargée en local) pour tracer les graphiques hors-ligne.
* `logo.png` / `logo.ico` : Ressources visuelles de l'application.
