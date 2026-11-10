// src/services/excelsParentsServices.ts
import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
import type {
  NoteRow,
  StudentResult,
  SearchCriteria,
  StoreStatus,
} from '../models/resultsParents.js';

interface InternalStudentAggregate {
  codeeleve: string;
  matricule: string;
  nomEleve: string;
  anneeScolaire: string;
  // Stockage par matière + trimestre pour dédoublonner automatiquement
  notesMap: Map<string, Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'>>;
}

/**
 * Fusionne intelligemment deux entrées d'une même matière pour un même trimestre.
 * Si une moyenne générale est faible (< 5, nulle ou incomplète), on continue la recherche
 * pour retenir la vraie note (la plus grande / la plus complète) et conserver les coefficients et devoirs.
 */
function mergeNotes(
  existing: Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'>,
  incoming: Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'>
): Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'> {
  const existingMg = existing.moyenneGenerale ?? 0;
  const incomingMg = incoming.moyenneGenerale ?? 0;

  // Si l'une des deux est < 5 ou que l'autre est plus grande, on prend la note maximale (la vraie note)
  const bestMg = Math.max(existingMg, incomingMg);

  // Coefficient strictement positif disponible
  const bestCoef = existing.coefficient > 0
    ? existing.coefficient
    : (incoming.coefficient > 0 ? incoming.coefficient : 0);

  // Meilleurs scores d'évaluations individuelles
  const bestInterro1 = Math.max(existing.interro1 || 0, incoming.interro1 || 0);
  const bestInterro2 = Math.max(existing.interro2 || 0, incoming.interro2 || 0);
  const bestInterro3 = Math.max(existing.interro3 || 0, incoming.interro3 || 0);
  const bestInterro4 = Math.max(existing.interro4 || 0, incoming.interro4 || 0);
  const bestInterro5 = Math.max(existing.interro5 || 0, incoming.interro5 || 0);
  const bestMoyenneInterro = Math.max(existing.moyenneInterro || 0, incoming.moyenneInterro || 0);
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
    interro1: bestInterro1,
    interro2: bestInterro2,
    interro3: bestInterro3,
    interro4: bestInterro4,
    interro5: bestInterro5,
    moyenneInterro: bestMoyenneInterro,
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
  // Indexation par matricule et code élève
  private byMatricule = new Map<string, InternalStudentAggregate>();
  private byCode = new Map<string, InternalStudentAggregate>();
  private studentsList: InternalStudentAggregate[] = [];

  private _isLoaded = false;
  private _isLoading = false;
  private _filePath: string | null = null;
  private _loadedAt: string | null = null;
  private _error: string | null = null;
  private _totalNotes = 0;

  /**
   * Charge le fichier Excel en mémoire et indexe les notes par élève.
   */
  async loadExcel(filePath: string = 'Notes_au_06_11_2026.xlsx'): Promise<void> {
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
      const colIndexes: Record<string, number> = {};

      headerRow.eachCell((cell, colNumber) => {
        const val = cell.text?.trim();
        if (val) {
          colIndexes[val.toLowerCase()] = colNumber;
        }
      });

      const getColIndex = (...candidates: string[]): number | undefined => {
        for (const candidate of candidates) {
          const idx = colIndexes[candidate.toLowerCase()];
          if (idx !== undefined) return idx;
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
      
      // Mappage des interrogations 1 à 5 et de la moyenne
      const idxInterro1 = getColIndex('interrogation 1', 'interrogation1', 'interro1', 'interro 1');
      const idxInterro2 = getColIndex('interrogation 2', 'interrogation2', 'interro2', 'interro 2');
      const idxInterro3 = getColIndex('interrogation 3', 'interrogation3', 'interro3', 'interro 3');
      const idxInterro4 = getColIndex('interrogation 4', 'interrogation4', 'interro4', 'interro 4');
      const idxInterro5 = getColIndex('interrogation 5', 'interrogation5', 'interro5', 'interro 5');
      const idxMoyenneInterro = getColIndex('moyenneinterrogation', 'moyenne_interro', 'interrogations');

      const idxDevoir1 = getColIndex('devoir1', 'dev1');
      const idxDevoir2 = getColIndex('devoir2', 'dev2');
      const idxComposition = getColIndex('composition', 'comp');
      const idxMoyenneGenerale = getColIndex('moyennegeneral', 'moyenne_generale', 'mg');
      const idxMoyenneCoef = getColIndex('moyennecoef', 'moyenne_coef', 'mcoef');
      const idxRang = getColIndex('rang');
      const idxMention = getColIndex('mèntion', 'mention');

      const extractString = (row: ExcelJS.Row, colIdx?: number): string => {
        if (!colIdx) return '';
        const cell = row.getCell(colIdx);
        const val = cell.value;
        if (val === null || val === undefined) return '';
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

      const extractNumber = (row: ExcelJS.Row, colIdx?: number): number => {
        if (!colIdx) return 0;
        const cell = row.getCell(colIdx);
        const val = cell.value;
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (typeof val === 'object' && 'result' in val && typeof val.result === 'number') {
          return isNaN(val.result) ? 0 : val.result;
        }
        const strVal = String(cell.text ?? val).replace(',', '.').trim();
        const parsed = parseFloat(strVal);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Structures temporaires pour un chargement atomique
      const tempByMatricule = new Map<string, InternalStudentAggregate>();
      const tempByCode = new Map<string, InternalStudentAggregate>();
      const tempStudentsList: InternalStudentAggregate[] = [];

      // Lecture des lignes de données (à partir de la ligne 2)
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const codeeleve = extractString(row, idxCodeEleve);
        const matricule = extractString(row, idxMatricule);
        const nomEleve = extractString(row, idxNomEleve);
        const anneeScolaire = extractString(row, idxAnneeScolaire);

        if (!matricule && !codeeleve) return;

        const normCode = codeeleve.toLowerCase();
        const normMat = matricule.toLowerCase();

        let student: InternalStudentAggregate | undefined =
          (normMat ? tempByMatricule.get(normMat) : undefined) ||
          (normCode ? tempByCode.get(normCode) : undefined);

        if (!student) {
          student = {
            codeeleve,
            matricule,
            nomEleve,
            anneeScolaire,
            notesMap: new Map(),
          };
          tempStudentsList.push(student);
          if (normCode) tempByCode.set(normCode, student);
          if (normMat) tempByMatricule.set(normMat, student);
        } else {
          if (!student.matricule && matricule) {
            student.matricule = matricule;
            if (normMat) tempByMatricule.set(normMat, student);
          }
          if (!student.codeeleve && codeeleve) {
            student.codeeleve = codeeleve;
            if (normCode) tempByCode.set(normCode, student);
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
        const subjectKey = `${matiere.toLowerCase()}___${trimestre.toLowerCase()}`;

        const noteItem: Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'> = {
          matiere,
          trimestre,
          coefficient: extractNumber(row, idxCoefficient),
          interro1: extractNumber(row, idxInterro1),
          interro2: extractNumber(row, idxInterro2),
          interro3: extractNumber(row, idxInterro3),
          interro4: extractNumber(row, idxInterro4),
          interro5: extractNumber(row, idxInterro5),
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
        } else {
          const existingNote = student.notesMap.get(subjectKey)!;
          const merged = mergeNotes(existingNote, noteItem);
          student.notesMap.set(subjectKey, merged);
        }
      });

      let totalNotesCount = 0;
      for (const s of tempStudentsList) {
        totalNotesCount += s.notesMap.size;
      }

      this.byMatricule = tempByMatricule;
      this.byCode = tempByCode;
      this.studentsList = tempStudentsList;
      this._totalNotes = totalNotesCount;
      this._filePath = resolvedPath;
      this._loadedAt = new Date().toISOString();
      this._isLoaded = true;

      const duration = Date.now() - startTime;
      console.log(
        `[ExcelStore] ✅ Fichier chargé et dédoublonné avec succès en ${duration}ms : ` +
        `${this.studentsList.length} élèves indexés, ${totalNotesCount} notes dédoublonnées.`
      );
    } catch (err: any) {
      this._error = err?.message || 'Erreur inconnue lors du chargement Excel';
      console.error('[ExcelStore] ❌ Échec du chargement du fichier Excel :', err);
      throw err;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Recherche un élève exclusivement par son matricule.
   */
  public search(queryOrCriteria?: string | SearchCriteria): StudentResult | null {
    if (!this._isLoaded || !queryOrCriteria) return null;

    const targetMatricule = typeof queryOrCriteria === 'string'
      ? queryOrCriteria.trim()
      : (queryOrCriteria.matricule || '').trim();

    if (!targetMatricule) return null;

    const normMat = targetMatricule.toLowerCase();
    const found = this.byMatricule.get(normMat) || this.byCode.get(normMat);

    if (!found) return null;

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

  public isLoaded(): boolean {
    return this._isLoaded;
  }

  public getStatus(): StoreStatus {
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