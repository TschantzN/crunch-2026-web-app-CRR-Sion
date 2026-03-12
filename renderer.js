let ipcRenderer = null;
try { ipcRenderer = require('electron').ipcRenderer; } catch(e) { console.log("Hors Electron"); }

const grid = document.getElementById('calendarGrid');
const modal = document.getElementById('sessionModal');
const treeContainer = document.getElementById('patientTreeContainer');
const timeline = document.getElementById('patientTimeline');
const btnShowTree = document.getElementById('btnShowTree');
const exercisesContainer = document.getElementById('exercisesContainer');

let sessionsData = {}; 
let idCounter = 1; 
let currentSessionId = null; 
let editingSessionId = null; 
let currentSelectedPatient = null; 
let chartInstances = []; 

// --- GESTION DU TEMPS ---
let currentWeekStart = new Date();
currentWeekStart.setDate(currentWeekStart.getDate() - (currentWeekStart.getDay() === 0 ? 6 : currentWeekStart.getDay() - 1));

let targetColForNewSession = 0;
let targetRowForNewSession = 0;
const daysNames = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

// --- SAUVEGARDE LOCALE ---
function saveLocalData() {
    if(ipcRenderer) ipcRenderer.send('sauvegarder-donnees', { sessions: sessionsData, counter: idCounter });
}

async function loadLocalData() {
    if(ipcRenderer) {
        let savedData = await ipcRenderer.invoke('charger-donnees');
        if (savedData) {
            sessionsData = savedData.sessions;
            idCounter = savedData.counter;
            return true;
        }
    }
    return false;
}

// --- GÉNÉRATION DE LA GRILLE ---
let startHour = 8;
for (let r = 0; r < 20; r++) {
    if (r % 4 === 0) {
        let hourText = (startHour + Math.floor(r/2));
        let label = document.createElement('div');
        label.className = 'time-label'; label.style.gridRow = `span 4`; label.innerHTML = `${hourText}h00<br>|<br>${hourText + 2}h00`;
        grid.appendChild(label);
    }
    for (let c = 0; c < 5; c++) {
        let cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        if (r % 4 === 3) cell.classList.add('border-thick'); 
        cell.onclick = function() { openCreateModal(r, c); };
        grid.appendChild(cell);
    }
}

function updateCalendarUI() {
    document.getElementById('weekSelector').value = currentWeekStart.toISOString().split('T')[0];
    const headerIds = ['h-mon', 'h-tue', 'h-wed', 'h-thu', 'h-fri'];
    for(let i=0; i<5; i++) {
        let d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        let dayNum = d.getDate().toString().padStart(2, '0');
        let monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
        document.getElementById(headerIds[i]).innerText = `${daysNames[i]} ${dayNum}/${monthNum}`;
    }
    renderEventsForCurrentWeek();
}

function changeWeek(offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    updateCalendarUI();
}

function jumpToDate(dateString) {
    if(!dateString) return;
    let d = new Date(dateString);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    currentWeekStart = d;
    updateCalendarUI();
}

function switchTab(tabName) {
    document.getElementById('tab-current').style.display = (tabName === 'current') ? 'block' : 'none';
    document.getElementById('tab-history').style.display = (tabName === 'history') ? 'block' : 'none';
    document.getElementById('btnTabCurrent').className = (tabName === 'current') ? 'tab-btn active' : 'tab-btn';
    document.getElementById('btnTabHistory').className = (tabName === 'history') ? 'tab-btn active' : 'tab-btn';
    if(tabName === 'history') renderHistoryTab();
}

// --- MODALE CREATION/EDITION ---
function openCreateModal(r, c) {
    editingSessionId = null; 
    targetColForNewSession = c;
    targetRowForNewSession = r;
    let clickedDate = new Date(currentWeekStart);
    clickedDate.setDate(clickedDate.getDate() + c);
    let h = startHour + Math.floor(r/2);
    let m = (r % 2 === 0) ? "00" : "30";
    
    document.getElementById('modal-title').innerText = "Ajouter une séance";
    document.getElementById('m-datetime').value = `${daysNames[c]} ${clickedDate.toLocaleDateString('fr-FR')} à ${h}h${m}`;
    document.getElementById('m-patient').value = ""; document.getElementById('m-atelier').value = "";
    document.getElementById('m-msp').value = "Dr. Martin"; document.getElementById('m-duree').value = "1";
    document.getElementById('m-couleur').value = "planned";
    
    modal.style.display = "flex"; 
    document.getElementById('m-patient').focus();
}

function closeModal() { modal.style.display = "none"; editingSessionId = null; }

function saveModalSession() {
    let patient = document.getElementById('m-patient').value.trim() || "Patient Inconnu";
    let msp = document.getElementById('m-msp').value.trim() || "Non assigné";
    let atelier = document.getElementById('m-atelier').value || "Atelier";
    let durationBlocks = parseInt(document.getElementById('m-duree').value);
    let colorClass = document.getElementById('m-couleur').value;

    if (editingSessionId) {
        let data = sessionsData[editingSessionId];
        data.patient = patient; data.msp = msp; data.atelier = atelier;
        data.durationBlocks = durationBlocks; data.status = colorClass;
        data.title = `${patient} - ${atelier} (${data.time})`;
        closeModal(); updateDropdowns(); saveLocalData(); renderEventsForCurrentWeek(); selectSession(editingSessionId);
    } else {
        let sessionDateObj = new Date(currentWeekStart);
        sessionDateObj.setDate(sessionDateObj.getDate() + targetColForNewSession);
        let dateStr = sessionDateObj.toISOString().split('T')[0];
        let h = startHour + Math.floor(targetRowForNewSession/2);
        let m = (targetRowForNewSession % 2 === 0) ? "00" : "30";
        let timeStr = `${h.toString().padStart(2, '0')}:${m}`;
        let displayTimeStr = `${h}h${m}`;
        let displayDayStr = `${daysNames[targetColForNewSession]} ${sessionDateObj.getDate()}/${sessionDateObj.getMonth()+1}`;

        let newId = 'session_' + idCounter++;
        sessionsData[newId] = {
            id: newId, date: dateStr, time: timeStr, dayTimeLabel: `${displayDayStr} - ${displayTimeStr}`, 
            patient: patient, msp: msp, atelier: atelier, title: `${patient} - ${atelier} (${displayTimeStr})`, 
            status: colorClass, confort: 5, fatigue: 'Modérée', feedbackText: '',
            exercises: [], 
            durationBlocks: durationBlocks
        };
        closeModal(); updateDropdowns(); saveLocalData(); renderEventsForCurrentWeek(); selectSession(newId); 
    }
}

function editCurrentSession() {
    if(!currentSessionId) return;
    editingSessionId = currentSessionId;
    let data = sessionsData[currentSessionId];
    document.getElementById('modal-title').innerText = "Modifier la séance";
    document.getElementById('m-datetime').value = data.dayTimeLabel;
    document.getElementById('m-patient').value = data.patient;
    document.getElementById('m-msp').value = data.msp;
    document.getElementById('m-atelier').value = data.atelier;
    document.getElementById('m-duree').value = data.durationBlocks;
    document.getElementById('m-couleur').value = data.status;
    modal.style.display = "flex";
}

function deleteCurrentSession() {
    if(!currentSessionId) return;
    if(confirm("Êtes-vous sûr de vouloir effacer définitivement cette séance ?")) {
        delete sessionsData[currentSessionId];
        currentSessionId = null;
        saveLocalData();
        document.getElementById('formControls').style.display = "none";
        document.getElementById('session-actions').style.display = "none";
        document.getElementById('selectedSession').innerText = "Sélectionnez une séance dans l'agenda";
        btnShowTree.style.display = 'none'; treeContainer.style.display = 'none';
        renderEventsForCurrentWeek(); updateDropdowns();
    }
}

function renderEventsForCurrentWeek() {
    document.querySelectorAll('.event').forEach(el => el.remove());
    let mondayStr = currentWeekStart.toISOString().split('T')[0];
    let fridayObj = new Date(currentWeekStart); fridayObj.setDate(fridayObj.getDate() + 4);
    let fridayStr = fridayObj.toISOString().split('T')[0];

    Object.values(sessionsData).forEach(data => {
        if (data.date >= mondayStr && data.date <= fridayStr) {
            let sessionDateObj = new Date(data.date);
            let col = sessionDateObj.getDay() - 1; 
            let h = parseInt(data.time.split(':')[0]); let m = parseInt(data.time.split(':')[1]);
            let row = (h - startHour) * 2 + (m === 30 ? 1 : 0);

            let targetCell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if(targetCell) {
                let eventBlock = document.createElement('div');
                eventBlock.id = data.id; eventBlock.className = 'event ' + data.status;
                eventBlock.style.height = `calc(${data.durationBlocks * 100}% + ${data.durationBlocks - 1}px)`;
                eventBlock.innerHTML = `<strong>${data.patient}</strong><span>${data.atelier}</span>`;
                if(data.id === currentSessionId) eventBlock.classList.add('selected');
                eventBlock.onclick = function(e) { e.stopPropagation(); switchTab('current'); selectSession(data.id); };
                targetCell.appendChild(eventBlock);
            }
        }
    });
}

// --- GESTION DES EXERCICES & SUGGESTIONS ---

let patientExerciseTemplates = {}; 

function updateExerciseSuggestions(patientName) {
    let quickAddSelect = document.getElementById('quickAddExo');
    quickAddSelect.innerHTML = '<option value="">+ Copier l\'historique...</option>';
    patientExerciseTemplates = {};
    
    Object.values(sessionsData).forEach(session => {
        if(session.patient === patientName && session.exercises) {
            session.exercises.forEach(ex => {
                if (!patientExerciseTemplates[ex.name]) {
                    // Mémorise tous les réglages, y compris l'exo utilisé
                    patientExerciseTemplates[ex.name] = {
                        exoModel: ex.exoModel || "Aucun",
                        assistance: ex.assistance || 5,
                        hasWeight: ex.hasWeight,
                        hasTime: ex.hasTime
                    };
                }
            });
        }
    });
    
    Object.keys(patientExerciseTemplates).forEach(exName => {
        let option = document.createElement('option');
        option.value = exName; option.innerText = exName;
        quickAddSelect.appendChild(option);
    });
}

function addExistingExercise(exName) {
    if (!exName) return;
    let template = patientExerciseTemplates[exName];
    if (template) {
        addExerciseField(exName, template.exoModel, template.assistance, template.hasWeight, 0, template.hasTime, 0);
    }
}

// Fonction modifiée pour inclure Exo + Aide directement dans l'exercice
function addExerciseField(name = "", exoModel = "Aucun", assistance = 5, hasWeight = false, weightVal = 0, hasTime = false, timeVal = 0) {
    let block = document.createElement('div');
    block.className = 'exercise-block';
    
    block.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <input type="text" class="ex-name" placeholder="Nom de l'exercice..." value="${name}" style="flex: 1; margin-right: 10px; font-weight: bold;">
            <button type="button" class="btn-small-delete" onclick="this.parentElement.parentElement.remove()">🗑️</button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 8px; background: #e8f4f8; padding: 8px; border-radius: 4px; border: 1px solid #bce0ec;">
            <div style="flex: 2;">
                <label style="font-size: 0.75rem; color: var(--primary); margin-bottom: 2px; display:block; font-weight:bold;">Exosquelette</label>
                <select class="ex-model" style="padding: 4px; font-size: 0.8rem; width:100%; border: 1px solid #ccc; border-radius: 4px;">
                    <option value="Aucun" ${exoModel === 'Aucun' ? 'selected' : ''}>Aucun (Sans exo)</option>
                    <option value="Uplift (total)" ${exoModel === 'Uplift (total)' ? 'selected' : ''}>Uplift (total)</option>
                    <option value="Mate XT go (sup)" ${exoModel === 'Mate XT go (sup)' ? 'selected' : ''}>Mate XT go (sup)</option>
                    <option value="dnsys Z1 (inf)" ${exoModel === 'dnsys Z1 (inf)' ? 'selected' : ''}>dnsys Z1 (inf)</option>
                </select>
            </div>
            <div style="flex: 1;">
                <label style="font-size: 0.75rem; color: var(--primary); margin-bottom: 2px; display:block; font-weight:bold;">Aide (0-10)</label>
                <input type="number" class="ex-assist" min="0" max="10" value="${assistance}" style="padding: 4px; font-size: 0.8rem; width:100%; border: 1px solid #ccc; border-radius: 4px;">
            </div>
        </div>

        <div class="exercise-metrics" style="margin-top: 8px;">
            <div class="exercise-measure">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="ex-cb-weight" ${hasWeight ? 'checked' : ''} onchange="this.parentElement.parentElement.querySelector('.ex-val-weight').style.display = this.checked ? 'inline-block' : 'none'">
                    Poids
                </label>
                <input type="number" class="ex-val-weight exercise-input-val" value="${weightVal}" style="display:${hasWeight ? 'inline-block' : 'none'}; margin-left: 5px;">
                <span style="font-size:0.8rem; margin-left: 2px;">kg</span>
            </div>
            
            <div class="exercise-measure">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="ex-cb-time" ${hasTime ? 'checked' : ''} onchange="this.parentElement.parentElement.querySelector('.ex-val-time').style.display = this.checked ? 'inline-block' : 'none'">
                    Temps
                </label>
                <input type="number" class="ex-val-time exercise-input-val" value="${timeVal}" style="display:${hasTime ? 'inline-block' : 'none'}; margin-left: 5px;">
                <span style="font-size:0.8rem; margin-left: 2px;">min</span>
            </div>
        </div>
    `;
    exercisesContainer.appendChild(block);
}

function selectSession(sessionId) {
    try {
        currentSessionId = sessionId;
        let data = sessionsData[sessionId];
        let eventElement = document.getElementById(sessionId);

        document.querySelectorAll('.event').forEach(el => el.classList.remove('selected'));
        if(eventElement) eventElement.classList.add('selected');

        document.getElementById('formControls').style.display = "block";
        document.getElementById('session-actions').style.display = "flex"; 
        
        // --- SÉCURITÉ ANTI-CRASH ---
        document.getElementById('selectedSession').innerText = data.title || "Séance";
        document.getElementById('edit-msp').value = data.msp || ""; 
        document.getElementById('sessionStatus').value = data.status || "planned"; 
        document.getElementById('confort').value = data.confort || 5;
        document.getElementById('confort-val').innerText = data.confort || 5;
        
        // Radio button fix
        let targetRadio = document.querySelector(`input[name="fatigue"][value="${data.fatigue}"]`);
        if(targetRadio) { targetRadio.checked = true; } 
        else { document.getElementById('fatigue-moderee').checked = true; }

        document.getElementById('feedbackText').value = data.feedbackText || "";
        
        updateExerciseSuggestions(data.patient);

        exercisesContainer.innerHTML = ""; 
        if(data.exercises && data.exercises.length > 0) {
            data.exercises.forEach(ex => {
                // Rétrocompatibilité si l'exo n'avait pas d'exoModel avant
                let exo = ex.exoModel || data.exoModel || "Aucun";
                let assist = ex.assistance !== undefined ? ex.assistance : (data.assistanceExo || 5);
                addExerciseField(ex.name, exo, assist, ex.hasWeight, ex.weight, ex.hasTime, ex.time);
            });
        }

        currentSelectedPatient = data.patient;
        btnShowTree.style.display = 'block';
        updateTreeContent(data.patient);
    } catch (err) {
        console.error("Erreur lors du chargement de la séance :", err);
    }
}

function saveFeedback() {
    if (!currentSessionId) return; 
    
    try {
        let data = sessionsData[currentSessionId];
        
        // 1. Sauvegarde des données générales avec sécurité
        data.status = document.getElementById('sessionStatus').value;
        data.msp = document.getElementById('edit-msp').value.trim(); 
        data.confort = document.getElementById('confort').value;
        
        let fatigueRadio = document.querySelector('input[name="fatigue"]:checked');
        data.fatigue = fatigueRadio ? fatigueRadio.value : 'Modérée';
        
        data.feedbackText = document.getElementById('feedbackText').value;

        // 2. Sauvegarde des exercices de manière sécurisée
        data.exercises = [];
        let exerciseBlocks = document.querySelectorAll('.exercise-block');
        
        exerciseBlocks.forEach(block => {
            let nameInput = block.querySelector('.ex-name');
            // On vérifie que le champ existe et n'est pas vide
            if(nameInput && nameInput.value.trim() !== "") { 
                let modelSelect = block.querySelector('.ex-model');
                let assistInput = block.querySelector('.ex-assist');
                let cbWeight = block.querySelector('.ex-cb-weight');
                let valWeight = block.querySelector('.ex-val-weight');
                let cbTime = block.querySelector('.ex-cb-time');
                let valTime = block.querySelector('.ex-val-time');

                data.exercises.push({
                    name: nameInput.value.trim(),
                    exoModel: modelSelect ? modelSelect.value : "Aucun",
                    assistance: assistInput ? (parseInt(assistInput.value) || 0) : 0,
                    hasWeight: cbWeight ? cbWeight.checked : false,
                    weight: valWeight ? (parseFloat(valWeight.value) || 0) : 0,
                    hasTime: cbTime ? cbTime.checked : false,
                    time: valTime ? (parseFloat(valTime.value) || 0) : 0
                });
            }
        });

        // 3. Mise à jour de l'interface
        updateDropdowns(); 
        renderEventsForCurrentWeek(); 
        updateExerciseSuggestions(data.patient); 
        updateTreeContent(data.patient);
        
        // 4. Écriture dans le fichier JSON
        saveLocalData(); 
        
        // 5. CORRECTION : Animation du bouton sans blocage
        let btnSave = document.querySelector('.btn-save');
        if(btnSave) {
            btnSave.innerHTML = '✅ Enregistré !';
            btnSave.style.backgroundColor = 'var(--green)';
            
            // Empêche le multi-clic spam pendant l'animation
            btnSave.disabled = true; 
            
            setTimeout(() => {
                btnSave.innerHTML = '💾 Mettre à jour'; // Texte forcé en dur
                btnSave.style.backgroundColor = ''; 
                btnSave.disabled = false; // Réactive le bouton
            }, 1500);
        }

    } catch (error) {
        console.error("Erreur lors de la sauvegarde :", error);
        alert("Une petite erreur est survenue lors de l'enregistrement. Vérifiez que tous les champs sont bien remplis.");
    }
}

// --- GÉNÉRATION PDF SIMPLE ---
async function generatePreviewPDF() {
    if (!currentSessionId || !ipcRenderer) return;
    let data = sessionsData[currentSessionId];
    let logoPath = 'logo.png';
    try { logoPath = 'file:///' + require('path').resolve(__dirname, 'logo.png').replace(/\\/g, '/'); } catch(e) {}

    let exercisesHTML = "";
    if(data.exercises && data.exercises.length > 0) {
        exercisesHTML = `<div class="print-section"><h3>Exercices Réalisés</h3>`;
        data.exercises.forEach(ex => {
            let details = [];
            if(ex.hasWeight) details.push(`${ex.weight} kg`);
            if(ex.hasTime) details.push(`${ex.time} min`);
            exercisesHTML += `<div class="print-row" style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <strong>${ex.name} :</strong> 
                <span style="text-align:right;">
                    <span style="font-size: 0.85rem; color: #008EA6; background:#e8f4f8; padding:2px 6px; border-radius:4px;">Exo: ${ex.exoModel} (Aide: ${ex.assistance}/10)</span>
                    <br><strong>${details.join(' / ')}</strong>
                </span>
            </div>`;
        });
        exercisesHTML += `</div>`;
    }

    const previewHTML = `
    <!DOCTYPE html>
    <html lang="fr"><head><meta charset="UTF-8"><title>Rapport Séance - ${data.patient}</title>
    <style> body { font-family: sans-serif; padding: 40px; background: #e0e0e0; } .page { background: white; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 0 15px rgba(0,0,0,0.15); } .print-header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #008EA6; padding-bottom: 20px; margin-bottom: 20px; } .print-logo { height: 80px; } .print-title { color: #008EA6; font-size: 1.8rem; margin: 0; } .print-section { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #fafafa; } .print-section h3 { margin-top: 0; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 5px; } .print-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 1.1rem;} .print-text { font-style: italic; background: white; padding: 15px; border: 1px solid #ccc; border-radius: 4px; min-height: 100px; } .no-print { text-align: center; margin-bottom: 20px; } .btn-print { background-color: #008EA6; color: white; border: none; padding: 12px 25px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1.1rem;} @media print { body { background: white; padding: 0; } .page { box-shadow: none; padding: 0; } .no-print { display: none !important; } } </style>
    </head><body>
        <div class="no-print"><button class="btn-print" onclick="window.opener.executeElectronPDF(window)">💾 Sauvegarder en PDF / Imprimer</button></div>
        <div class="page">
            <div class="print-header"><img src="${logoPath}" class="print-logo"><div><h1 class="print-title">Rapport de Séance Exosquelette</h1><p style="margin:0; color:#555;">Centre de Réadaptation de Sion (CRR)</p></div></div>
            <div class="print-section"><h3>Informations Générales</h3><div class="print-row"><strong>Patient :</strong> <span>${data.patient}</span></div><div class="print-row"><strong>MSP :</strong> <span>${data.msp}</span></div><div class="print-row"><strong>Date :</strong> <span>${data.dayTimeLabel}</span></div></div>
            <div class="print-section"><h3>Évaluation Patient</h3><div class="print-row"><strong>Confort :</strong> <span>${data.confort} / 10</span></div><div class="print-row"><strong>Fatigue :</strong> <span>${data.fatigue}</span></div></div>
            ${exercisesHTML}
            <div class="print-section" style="border:none; background:transparent; padding:0;"><h3>Observations</h3><div class="print-text">${data.feedbackText.replace(/\n/g, '<br>') || "Aucune observation saisie."}</div></div>
        </div>
    </body></html>`;
    let previewWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes');
    previewWin.document.write(previewHTML); previewWin.document.close();
}

window.executeElectronPDF = async function(previewWindow) {
    let btnContainer = previewWindow.document.querySelector('.no-print');
    if(btnContainer) btnContainer.style.display = 'none'; 
    setTimeout(async () => {
        if(ipcRenderer) { previewWindow.focus(); let success = await ipcRenderer.invoke('exporter-pdf'); if(success) previewWindow.close(); else if(btnContainer) btnContainer.style.display = 'block'; }
        else { previewWindow.print(); if(btnContainer) btnContainer.style.display = 'block'; }
    }, 100);
};

// --- TIMELINE ET GRAPHIQUES ---
function filterHistoryByDropdown() {
    let patient = document.getElementById('patientFilter').value;
    renderHistoryTab();
    if(patient !== 'all') {
        currentSelectedPatient = patient; btnShowTree.style.display = 'block'; updateTreeContent(patient);
    } else {
        btnShowTree.style.display = 'none'; treeContainer.style.display = 'none';
    }
}

function updateDropdowns() {
    let filterDropdown = document.getElementById('patientFilter');
    let dataList = document.getElementById('patientList');
    let mspList = document.getElementById('mspList');
    let currentPatientValue = filterDropdown.value; 
    let patients = new Set(); let msps = new Set(["Dr. Martin", "Mme. Dubois (Ergo)", "M. Favre (Physio)"]); 
    Object.values(sessionsData).forEach(session => { if(session.patient) patients.add(session.patient); if (session.msp) msps.add(session.msp); });
    filterDropdown.innerHTML = '<option value="all">-- Tous les patients --</option>'; dataList.innerHTML = ''; mspList.innerHTML = '';
    patients.forEach(patient => {
        let option = document.createElement('option'); option.value = patient; option.innerText = patient; filterDropdown.appendChild(option);
        let datalistOption = document.createElement('option'); datalistOption.value = patient; dataList.appendChild(datalistOption);
    });
    msps.forEach(msp => { let mspOption = document.createElement('option'); mspOption.value = msp; mspList.appendChild(mspOption); });
    if (patients.has(currentPatientValue)) filterDropdown.value = currentPatientValue;
}

function openSessionFromHistory(sessionId) { 
    let data = sessionsData[sessionId]; jumpToDate(data.date); switchTab('current'); selectSession(sessionId); 
}

function renderHistoryTab() {
    let filterValue = document.getElementById('patientFilter').value;
    let listContainer = document.getElementById('historyList'); listContainer.innerHTML = ''; 
    let sessionsArray = Object.values(sessionsData);
    if (filterValue !== 'all') sessionsArray = sessionsArray.filter(s => s.patient === filterValue);
    sessionsArray.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

    if (sessionsArray.length === 0) { listContainer.innerHTML = '<p style="color: var(--text-light); font-style: italic;">Aucune donnée.</p>'; return; }

    sessionsArray.forEach(data => {
        let card = document.createElement('div'); card.className = 'history-card'; card.onclick = () => openSessionFromHistory(data.id);
        
        let exosUsed = [...new Set((data.exercises || []).map(ex => ex.exoModel).filter(m => m && m !== 'Aucun'))];
        let exoBadge = exosUsed.length > 0 ? exosUsed.join(', ') : "Sans Exo";

        card.innerHTML = `<div class="history-card-header"><div class="history-card-date">${data.dayTimeLabel}</div><div><strong>MSP:</strong> ${data.msp}</div></div>
            <div style="font-weight:bold; margin-bottom:8px;">${data.patient} - ${data.atelier}</div>
            <div class="history-card-metrics">
                <span class="metric-badge">${exoBadge}</span>
                <span class="metric-badge">Confort : ${data.confort}/10</span>
                <span class="metric-badge">Fatigue : ${data.fatigue}</span>
            </div>
            <div style="font-size: 0.9rem; font-style: italic; color: #444;">"${data.feedbackText || "Aucune note."}"</div>`;
        listContainer.appendChild(card);
    });
}

function toggleTree() {
    if (treeContainer.style.display === 'none' || treeContainer.style.display === '') {
        treeContainer.style.display = 'block'; window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else { treeContainer.style.display = 'none'; }
}

function updateTreeContent(patientName) {
    document.getElementById('treePatientName').innerText = "Parcours de réadaptation : " + patientName; 
    timeline.innerHTML = '';
    
    let patientSessions = Object.values(sessionsData).filter(s => s.patient === patientName);
    patientSessions.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    let exercisesPlotData = {};

    patientSessions.forEach(data => {
        let exosUsed = [...new Set((data.exercises || []).map(ex => ex.exoModel).filter(m => m && m !== 'Aucun'))];
        let exoBadge = exosUsed.length > 0 ? `Exos: ${exosUsed.join(', ')}` : "Sans Exosquelette";

        let node = document.createElement('div'); node.className = 'timeline-node status-' + data.status; 
        node.innerHTML = `<div class="timeline-date">${data.dayTimeLabel}</div><div class="timeline-title">${data.atelier}</div>
            <div style="font-size: 0.8rem; margin-bottom:5px;">MSP : ${data.msp}</div>
            <div style="font-size: 0.8rem; color:var(--primary); font-weight:bold;">${exoBadge}</div>
            <div class="timeline-feedback">${data.feedbackText || 'En attente...'}</div>`;
        timeline.appendChild(node);

        if(data.exercises && data.exercises.length > 0) {
            let shortDate = new Date(data.date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
            
            data.exercises.forEach(ex => {
                let exName = ex.name.trim();
                if(!exercisesPlotData[exName]) {
                    exercisesPlotData[exName] = { labels: [], weights: [], times: [], assistances: [] };
                }
                exercisesPlotData[exName].labels.push(shortDate);
                exercisesPlotData[exName].weights.push(ex.hasWeight ? ex.weight : null);
                exercisesPlotData[exName].times.push(ex.hasTime ? ex.time : null);
                exercisesPlotData[exName].assistances.push(ex.assistance || 0); 
            });
        }
    });

    generateCharts(exercisesPlotData);
}

function generateCharts(plotData) {
    const container = document.getElementById('chartsContainer'); container.innerHTML = ''; 
    chartInstances.forEach(chart => chart.destroy()); chartInstances = [];
    let exercisesNames = Object.keys(plotData);
    
    if(exercisesNames.length === 0) {
        container.innerHTML = '<p style="color:#999; font-style:italic; padding: 20px;">Ajoutez des exercices chiffrés pour voir l\'évolution croisée de l\'effort avec l\'aide de l\'exosquelette.</p>'; return;
    }

    exercisesNames.forEach((exName, index) => {
        let exData = plotData[exName];
        let hasValidWeight = exData.weights.some(v => v !== null); let hasValidTime = exData.times.some(v => v !== null);

        if(hasValidWeight) {
            let chartBlock = document.createElement('div'); chartBlock.style.background = 'white'; chartBlock.style.border = '1px solid #ddd'; chartBlock.style.borderRadius = '6px'; chartBlock.style.padding = '15px';
            chartBlock.innerHTML = `<h4 style="margin:0 0 10px 0; color:var(--primary); font-size:1rem;">Évolution Poids : ${exName}</h4><canvas id="chart_w_${index}"></canvas>`;
            container.appendChild(chartBlock);

            const ctxW = document.getElementById(`chart_w_${index}`).getContext('2d');
            const newChartW = new Chart(ctxW, {
                type: 'line', data: { labels: exData.labels, datasets: [ { label: 'Effort Patient (kg)', data: exData.weights, borderColor: '#008EA6', backgroundColor: '#008EA6', yAxisID: 'yMeasure', tension: 0.3 }, { label: 'Aide Exo (0-10)', data: exData.assistances, borderColor: '#bdc3c7', backgroundColor: 'transparent', borderDash: [5, 5], pointStyle: 'rectRot', pointRadius: 6, yAxisID: 'yAssist', tension: 0.1 } ] },
                options: { responsive: true, interaction: { mode: 'index', intersect: false }, scales: { yMeasure: { type: 'linear', display: true, position: 'left', title: {display: true, text: 'kg'} }, yAssist: { type: 'linear', display: true, position: 'right', min: 0, max: 10, title: {display: true, text: "Aide Exo"}, grid: {drawOnChartArea: false} } } }
            });
            chartInstances.push(newChartW);
        }

        if(hasValidTime) {
            let chartBlock = document.createElement('div'); chartBlock.style.background = 'white'; chartBlock.style.border = '1px solid #ddd'; chartBlock.style.borderRadius = '6px'; chartBlock.style.padding = '15px';
            chartBlock.innerHTML = `<h4 style="margin:0 0 10px 0; color:var(--orange); font-size:1rem;">Évolution Temps : ${exName}</h4><canvas id="chart_t_${index}"></canvas>`;
            container.appendChild(chartBlock);

            const ctxT = document.getElementById(`chart_t_${index}`).getContext('2d');
            const newChartT = new Chart(ctxT, {
                type: 'line', data: { labels: exData.labels, datasets: [ { label: 'Temps Patient (min)', data: exData.times, borderColor: '#f39c12', backgroundColor: '#f39c12', yAxisID: 'yMeasure', tension: 0.3 }, { label: 'Aide Exo (0-10)', data: exData.assistances, borderColor: '#bdc3c7', backgroundColor: 'transparent', borderDash: [5, 5], pointStyle: 'rectRot', pointRadius: 6, yAxisID: 'yAssist', tension: 0.1 } ] },
                options: { responsive: true, interaction: { mode: 'index', intersect: false }, scales: { yMeasure: { type: 'linear', display: true, position: 'left', title: {display: true, text: 'min'} }, yAssist: { type: 'linear', display: true, position: 'right', min: 0, max: 10, title: {display: true, text: "Aide Exo"}, grid: {drawOnChartArea: false} } } }
            });
            chartInstances.push(newChartT);
        }
    });
}

// --- EXPORT PDF GLOBAL ---
async function exportPatientJourneyPDF() {
    if (!currentSelectedPatient) return;
    let logoPath = 'logo.png'; try { logoPath = 'file:///' + require('path').resolve(__dirname, 'logo.png').replace(/\\/g, '/'); } catch(e) {}
    let patientSessions = Object.values(sessionsData).filter(s => s.patient === currentSelectedPatient);
    patientSessions.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time)); 

    let timelineHTML = '';
    patientSessions.forEach(data => {
        let exosHtml = "";
        if (data.exercises && data.exercises.length > 0) {
            exosHtml = `<div style="margin-top:10px; padding: 10px; background: #e8f4f8; border-radius: 4px; font-size:0.85rem;"><strong>Exercices :</strong><ul style="margin:5px 0 0 0; padding-left:20px;">`;
            data.exercises.forEach(ex => {
                let details = [];
                if(ex.hasWeight) details.push(`${ex.weight} kg`);
                if(ex.hasTime) details.push(`${ex.time} min`);
                exosHtml += `<li><strong>${ex.name}</strong> - Exo: ${ex.exoModel} (Aide ${ex.assistance}/10) | ${details.join(' - ')}</li>`;
            });
            exosHtml += `</ul></div>`;
        }

        timelineHTML += `<div class="print-section" style="page-break-inside: avoid;">
            <h3 style="color:#008EA6; margin-bottom: 5px;">${data.dayTimeLabel} - ${data.atelier}</h3>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 10px; color: #555;">
                <span><strong>MSP :</strong> ${data.msp}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 0.9rem;">
                <tr><td style="border: 1px solid #ddd; padding: 5px; text-align:center;"><strong>Confort :</strong> ${data.confort}/10</td>
                    <td style="border: 1px solid #ddd; padding: 5px; text-align:center;"><strong>Fatigue :</strong> ${data.fatigue}</td></tr>
            </table>
            <div style="background: #fafafa; padding: 10px; border: 1px solid #eee; border-radius: 4px; font-style: italic; font-size: 0.9rem;">
                "${(data.feedbackText || "").replace(/\n/g, '<br>') || "Aucune observation."}"
            </div>${exosHtml}
        </div>`;
    });

    let chartsHTML = '';
    if (chartInstances.length > 0) {
        chartsHTML = `<h2 style="color:#008EA6; border-bottom: 2px solid #008EA6; padding-bottom: 5px;">Évolution de la réadaptation</h2><div style="display:flex; flex-wrap:wrap; justify-content:center; gap:20px; margin-bottom:30px;">`;
        chartInstances.forEach((chart) => {
            let imgUrl = chart.toBase64Image();
            chartsHTML += `<div style="flex: 1 1 45%; border: 1px solid #ddd; padding: 10px; border-radius: 8px; background: white; text-align: center;"><img src="${imgUrl}" style="max-width: 100%; height: auto;"></div>`;
        });
        chartsHTML += `</div>`;
    }

    const previewHTML = `
    <!DOCTYPE html>
    <html lang="fr"><head><meta charset="UTF-8"><title>Parcours - ${currentSelectedPatient}</title>
    <style> body { font-family: sans-serif; padding: 40px; background: #e0e0e0; } .page { background: white; max-width: 900px; margin: 0 auto; padding: 40px; box-shadow: 0 0 15px rgba(0,0,0,0.15); } .print-header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #008EA6; padding-bottom: 20px; margin-bottom: 20px; } .print-logo { height: 80px; } .print-title { color: #008EA6; font-size: 1.8rem; margin: 0; } .print-section { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #fff; } .no-print { text-align: center; margin-bottom: 20px; position: sticky; top: 10px; z-index: 100;} .btn-print { background-color: #008EA6; color: white; border: none; padding: 12px 25px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1.1rem;} @media print { body { background: white; padding: 0; } .page { box-shadow: none; padding: 0; } .no-print { display: none !important; } } </style>
    </head><body>
        <div class="no-print"><button class="btn-print" onclick="window.opener.executeElectronPDF(window)">💾 Exporter en PDF / Imprimer</button></div>
        <div class="page">
            <div class="print-header"><img src="${logoPath}" class="print-logo"><div><h1 class="print-title">Parcours de Réadaptation Complet</h1><p style="margin:0; color:#555; font-size: 1.2rem;">Patient : <strong>${currentSelectedPatient}</strong></p></div></div>
            ${chartsHTML} <h2 style="color:#008EA6; border-bottom: 2px solid #008EA6; padding-bottom: 5px; margin-top: 40px;">Historique des Séances</h2> ${timelineHTML}
        </div>
    </body></html>`;
    let previewWin = window.open('', '_blank', 'width=950,height=900,scrollbars=yes');
    previewWin.document.write(previewHTML); previewWin.document.close();
}

// --- DÉMARRAGE ---
window.onload = async function() {
    let hasData = await loadLocalData();
    if (!hasData) { sessionsData = {}; saveLocalData(); }
    updateCalendarUI(); updateDropdowns();
};