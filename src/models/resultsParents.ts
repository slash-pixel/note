// src/models/resultsParents.ts

export interface NoteRow {
  codeeleve: string;
  matricule: string;
  nomEleve: string;
  matiere: string;
  trimestre: string;
  coefficient: number;
  interro1: number;
  interro2: number;
  interro3: number;
  interro4: number;
  interro5: number;
  moyenneInterro: number;
  devoir1: number;
  devoir2: number;
  composition: number;
  moyenneGenerale: number;
  moyenneCoef?: number;
  rang?: string;
  mention?: string;
  anneeScolaire?: string;
  familleMatiere?: string;
}

export interface StudentResult {
  codeeleve: string;
  matricule: string;
  nomEleve: string;
  anneeScolaire?: string;
  totalNotes: number;
  notes: Omit<NoteRow, 'codeeleve' | 'matricule' | 'nomEleve'>[];
}

export interface SearchCriteria {
  matricule: string;
}

export interface StoreStatus {
  isLoaded: boolean;
  isLoading: boolean;
  totalEleves: number;
  totalNotes: number;
  filePath: string | null;
  loadedAt: string | null;
  error?: string | null;
}