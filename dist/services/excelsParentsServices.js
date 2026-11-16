// src/services/excelsParentsServices.ts
import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
/**
 * Fusionne intelligemment deux entrées d'une même matière pour un même trimestre.
 * Si une moyenne générale est faible (< 5, nulle ou incomplète), on continue la recherche
 * pour retenir la vraie note (la plus grande / la plus complète) et conserver les coefficients et devoirs.
 */
function mergeNotes(existing, incoming) {
    const existingMg = existing.moyenneGenerale ?? 0;
    const incomingMg = incoming.moyenneGenerale ?? 0;
    // Si l'une des deux est < 5 ou que l'autre est plus grande, on prend la note maximale (la vraie note)
    const bestMg = Math.max(existingMg, incomingMg);
    // Coefficient strictement positif disponible
    const bestCoef = existing.coefficient > 0
        ? existing.coefficient
        : (incoming.coefficient > 0 ? incoming.coefficient : 0);
    // Meilleurs scores d'évaluations individuelles
    const bestInterro = Math.max(existing.moyenneInterro || 0, incoming.moyenneInterro || 0);
    const bestDev1 = Math.max(existing.devoir1 || 0, incoming.devoir1 || 0);
    const bestDev2 = Math.max(existing.devoir2 || 0, incoming.devoir2 || 0);
    const bestComp = Math.max(existing.composition || 0, incoming.composition || 0);
    const bestMoyenneCoef = Math.max(existing.moyenneCoef || 0, incoming.moyenneCoef || 0);
    // Rangs et mentions non vides
    const bestRang = existing.rang && existing.rang.trim()
        ? existing.rang
        : (incoming.rang && incoming.rang.trim() ? incoming.rang : undefined);
    const bestMention = existing.mention && existing.mention.trim()
        ? existing.mention
        : (incoming.mention && incoming.mention.trim() ? incoming.mention : undefined);
    return {
        matiere: existing.matiere || incoming.matiere,
        trimestre: existing.trimestre || incoming.trimestre,
        coefficient: bestCoef,
        moyenneInterro: bestInterro,
        devoir1: bestDev1,
        devoir2: bestDev2,
        composition: bestComp,
        moyenneGenerale: bestMg,
        moyenneCoef: bestMoyenneCoef || undefined,
        rang: bestRang,
        mention: bestMention,
        anneeScolaire: existing.anneeScolaire || incoming.anneeScolaire,
        familleMatiere: existing.familleMatiere || incoming.familleMatiere,
    };
}
class StudentNotesStore {
    // Indexation principale par clé normalisée (minuscules, sans espaces superflus)
    byMatricule = new Map();
    byCode = new Map();
    studentsList = [];
    _isLoaded = false;
    _isLoading = false;
    _filePath = null;
    _loadedAt = null;
    _error = null;
    _totalNotes = 0;
    /**
     * Charge le fichier Excel en mémoire et indexe les notes par élève (matricule, code, nom).
     * Dédoublonne les matières par trimestre et retient la note la plus élevée/complète.
     */
    async loadExcel(filePath = 'Notes_au_06_11_2026.xlsx') {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(resolvedPath)) {
            const msg = `Fichier Excel introuvable à l'emplacement : ${resolvedPath}`;
            this._error = msg;
            console.warn(`[ExcelStore] ⚠️ ${msg}`);
            return;
        }
        this._isLoading = true;
        this._error = null;
        const startTime = Date.now();
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(resolvedPath);
            const sheet = workbook.worksheets[0];
            if (!sheet) {
                throw new Error('Aucune feuille trouvée dans le classeur Excel.');
            }
            // Détection dynamique des colonnes depuis la ligne 1
            const headerRow = sheet.getRow(1);
            const colIndexes = {};
            headerRow.eachCell((cell, colNumber) => {
                const val = cell.text?.trim();
                if (val) {
                    colIndexes[val.toLowerCase()] = colNumber;
                }
            });
            const getColIndex = (...candidates) => {
                for (const candidate of candidates) {
                    const idx = colIndexes[candidate.toLowerCase()];
                    if (idx !== undefined)
                        return idx;
                }
                return undefined;
            };
            // Mappage des indices de colonnes clés
            const idxCodeEleve = getColIndex('codeeleve', 'code_eleve', 'code eleve');
            const idxMatricule = getColIndex('matricule', 'matricule_eleve');
            const idxNomEleve = getColIndex('eleve', 'nom_eleve', 'nom eleve', 'nom');
            const idxAnneeScolaire = getColIndex('année_scolaire', 'annee_scolaire', 'annee');
            const idxNomMatiere = getColIndex('nom_matiere', 'matiere');
            const idxFamilleMatiere = getColIndex('familledematiere', 'famille_matiere');
            const idxTrimestre = getColIndex('nom_trimsem', 'trimestre', 'trimestre_semestre');
            const idxCoefficient = getColIndex('coefficient', 'coef');
            const idxMoyenneInterro = getColIndex('moyenneinterrogation', 'moyenne_interro', 'interrogations');
            const idxDevoir1 = getColIndex('devoir1', 'dev1');
            const idxDevoir2 = getColIndex('devoir2', 'dev2');
            const idxComposition = getColIndex('composition', 'comp');
            const idxMoyenneGenerale = getColIndex('moyennegeneral', 'moyenne_generale', 'mg');
            const idxMoyenneCoef = getColIndex('moyennecoef', 'moyenne_coef', 'mcoef');
            const idxRang = getColIndex('rang');
            const idxMention = getColIndex('mèntion', 'mention');
            const extractString = (row, colIdx) => {
                if (!colIdx)
                    return '';
                const cell = row.getCell(colIdx);
                const val = cell.value;
                if (val === null || val === undefined)
                    return '';
                if (typeof val === 'object') {
                    if ('result' in val && val.result !== undefined && val.result !== null) {
                        return String(val.result).trim();
                    }
                    if ('text' in val && typeof val.text === 'string') {
                        return val.text.trim();
                    }
                }
                return String(cell.text ?? val).trim();
            };
            const extractNumber = (row, colIdx) => {
                if (!colIdx)
                    return 0;
                const cell = row.getCell(colIdx);
                const val = cell.value;
                if (val === null || val === undefined)
                    return 0;
                if (typeof val === 'number')
                    return isNaN(val) ? 0 : val;
                if (typeof val === 'object' && 'result' in val && typeof val.result === 'number') {
                    return isNaN(val.result) ? 0 : val.result;
                }
                const strVal = String(cell.text ?? val).replace(',', '.').trim();
                const parsed = parseFloat(strVal);
                return isNaN(parsed) ? 0 : parsed;
            };
            // Structures temporaires pour un chargement atomique
            const tempByMatricule = new Map();
            const tempByCode = new Map();
            const tempStudentsList = [];
            // Lecture des lignes de données (à partir de la ligne 2)
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1)
                    return;
                const codeeleve = extractString(row, idxCodeEleve);
                const matricule = extractString(row, idxMatricule);
                const nomEleve = extractString(row, idxNomEleve);
                const anneeScolaire = extractString(row, idxAnneeScolaire);
                // Si la ligne ne contient ni matricule ni code élève, on l'ignore
                if (!matricule && !codeeleve)
                    return;
                // Clés normalisées pour recherche insensible à la casse
                const normCode = codeeleve.toLowerCase();
                const normMat = matricule.toLowerCase();
                // Réconciliation de l'élève : relier par code OU par matricule
                let student = (normCode ? tempByCode.get(normCode) : undefined) ||
                    (normMat ? tempByMatricule.get(normMat) : undefined);
                if (!student) {
                    student = {
                        codeeleve,
                        matricule,
                        nomEleve,
                        anneeScolaire,
                        notesMap: new Map(),
                    };
                    tempStudentsList.push(student);
                    if (normCode)
                        tempByCode.set(normCode, student);
                    if (normMat)
                        tempByMatricule.set(normMat, student);
                }
                else {
                    // Si l'élève existait déjà mais sans matricule (ou sans code), on complète ses informations
                    if (!student.matricule && matricule) {
                        student.matricule = matricule;
                        if (normMat)
                            tempByMatricule.set(normMat, student);
                    }
                    if (!student.codeeleve && codeeleve) {
                        student.codeeleve = codeeleve;
                        if (normCode)
                            tempByCode.set(normCode, student);
                    }
                    if (!student.nomEleve && nomEleve) {
                        student.nomEleve = nomEleve;
                    }
                    if (!student.anneeScolaire && anneeScolaire) {
                        student.anneeScolaire = anneeScolaire;
                    }
                }
                const matiere = extractString(row, idxNomMatiere);
                const trimestre = extractString(row, idxTrimestre);
                // Clé unique pour dédoublonner : matière + trimestre
                const subjectKey = `${matiere.toLowerCase()}___${trimestre.toLowerCase()}`;
                // Construction de la note entrante
                const noteItem = {
                    matiere,
                    trimestre,
                    coefficient: extractNumber(row, idxCoefficient),
                    moyenneInterro: extractNumber(row, idxMoyenneInterro),
                    devoir1: extractNumber(row, idxDevoir1),
                    devoir2: extractNumber(row, idxDevoir2),
                    composition: extractNumber(row, idxComposition),
                    moyenneGenerale: extractNumber(row, idxMoyenneGenerale),
                    moyenneCoef: extractNumber(row, idxMoyenneCoef),
                    rang: extractString(row, idxRang) || undefined,
                    mention: extractString(row, idxMention) || undefined,
                    anneeScolaire: anneeScolaire || undefined,
                    familleMatiere: extractString(row, idxFamilleMatiere) || undefined,
                };
                if (!student.notesMap.has(subjectKey)) {
                    student.notesMap.set(subjectKey, noteItem);
                }
                else {
                    // Doublon sur la même matière et trimestre :
                    // On fusionne et on conserve la meilleure note (remplace notamment les moyennes < 5 par la vraie note plus grande)
                    const existingNote = student.notesMap.get(subjectKey);
                    const merged = mergeNotes(existingNote, noteItem);
                    student.notesMap.set(subjectKey, merged);
                }
            });
            // Calcul du total des notes dédoublonnées
            let totalNotesCount = 0;
            for (const s of tempStudentsList) {
                totalNotesCount += s.notesMap.size;
            }
            // Remplacement atomique des Maps en mémoire
            this.byMatricule = tempByMatricule;
            this.byCode = tempByCode;
            this.studentsList = tempStudentsList;
            this._totalNotes = totalNotesCount;
            this._filePath = resolvedPath;
            this._loadedAt = new Date().toISOString();
            this._isLoaded = true;
            const duration = Date.now() - startTime;
            console.log(`[ExcelStore] ✅ Fichier chargé et dédoublonné avec succès en ${duration}ms : ` +
                `${this.studentsList.length} élèves indexés (${this.byMatricule.size} par matricule, ${this.byCode.size} par code), ` +
                `${totalNotesCount} notes dédoublonnées (vraies notes conservées).`);
        }
        catch (err) {
            this._error = err?.message || 'Erreur inconnue lors du chargement Excel';
            console.error('[ExcelStore] ❌ Échec du chargement du fichier Excel :', err);
            throw err;
        }
        finally {
            this._isLoading = false;
        }
    }
    /**
     * Recherche un élève par matricule, code élève ou nom.
     * Retourne l'ensemble de ses notes nettoyées, dédoublonnées et avec les vraies moyennes.
     */
    search(queryOrCriteria) {
        if (!this._isLoaded || !queryOrCriteria)
            return null;
        let targetMatricule;
        let targetNom;
        if (typeof queryOrCriteria === 'string') {
            const q = queryOrCriteria.trim();
            targetMatricule = q;
            targetNom = q;
        }
        else {
            targetMatricule = (queryOrCriteria.matricule || queryOrCriteria.q)?.trim();
            targetNom = (queryOrCriteria.nom || queryOrCriteria.q)?.trim();
        }
        let found;
        // 1. Recherche prioritaire par matricule exact ou code élève
        if (targetMatricule) {
            const normMat = targetMatricule.toLowerCase();
            found = this.byMatricule.get(normMat) || this.byCode.get(normMat);
        }
        // 2. Recherche par nom si aucun matricule n'a correspondu
        if (!found && targetNom) {
            const searchName = targetNom.toLowerCase();
            // Correspondance exacte d'abord
            found = this.studentsList.find(s => s.nomEleve.toLowerCase() === searchName);
            // Sinon correspondance partielle
            if (!found) {
                found = this.studentsList.find(s => s.nomEleve.toLowerCase().includes(searchName));
            }
        }
        if (!found)
            return null;
        const notesList = Array.from(found.notesMap.values());
        return {
            codeeleve: found.codeeleve,
            matricule: found.matricule,
            nomEleve: found.nomEleve,
            anneeScolaire: found.anneeScolaire || undefined,
            totalNotes: notesList.length,
            notes: notesList,
        };
    }
    /**
     * Vérifie si le fichier est chargé en mémoire.
     */
    isLoaded() {
        return this._isLoaded;
    }
    /**
     * Retourne l'état courant du store.
     */
    getStatus() {
        return {
            isLoaded: this._isLoaded,
            isLoading: this._isLoading,
            totalEleves: this.studentsList.length,
            totalNotes: this._totalNotes,
            filePath: this._filePath,
            loadedAt: this._loadedAt,
            error: this._error,
        };
    }
}
export const notesStore = new StudentNotesStore();
