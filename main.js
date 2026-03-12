const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// --- 1. DÉFINIR LE DOSSIER DE SAUVEGARDE ---
let dossierBase;

if (app.isPackaged) {
    // Si l'application est compilée (.exe), on prend le dossier où se trouve le .exe
    dossierBase = path.dirname(app.getPath('exe'));
} else {
    // Si on est en développement (npm start), on prend le dossier du projet
    dossierBase = app.getAppPath();
}

// Chemin du dossier "log_exo_crr"
const logFolder = path.join(dossierBase, 'log_exo_crr');

// Si le dossier n'existe pas encore, on le crée automatiquement
if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder, { recursive: true });
}

// Le fichier JSON sera sauvegardé à l'intérieur
const fichierJson = path.join(logFolder, 'base_patients.json');

function createWindow () {
  // SUPPRIME LE MENU PAR DÉFAUT POUR TOUTES LES FENÊTRES
  Menu.setApplicationMenu(null);

  // FORCER LE THÈME CLAIR (Barre de titre blanche/grise claire)
  nativeTheme.themeSource = 'light';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#ffffff', // Évite le flash gris/noir au chargement
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Permet à notre HTML de parler directement à l'ordinateur
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Fermer l'app quand on clique sur la croix
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- LE MOTEUR DE SAUVEGARDE JSON ---
ipcMain.on('sauvegarder-donnees', (event, data) => {
    fs.writeFileSync(fichierJson, JSON.stringify(data, null, 2));
});

ipcMain.handle('charger-donnees', () => {
    if (fs.existsSync(fichierJson)) {
        let brut = fs.readFileSync(fichierJson, 'utf8');
        return JSON.parse(brut);
    }
    return null; // Si le fichier n'existe pas encore
});

// --- LE MOTEUR DE GÉNÉRATION PDF ---
ipcMain.handle('exporter-pdf', async (event) => {
    const win = BrowserWindow.getFocusedWindow();
    try {
        const { filePath } = await dialog.showSaveDialog(win, {
            title: 'Enregistrer le rapport',
            defaultPath: 'Rapport_Exosquelette_CRR.pdf',
            filters: [{ name: 'Fichiers PDF', extensions: ['pdf'] }]
        });

        if (filePath) {
            const pdfData = await win.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4'
            });
            
            fs.writeFileSync(filePath, pdfData);
            return true;
        }
        return false; 
    } catch (error) {
        console.error("Erreur lors de la création du PDF :", error);
        return false;
    }
});