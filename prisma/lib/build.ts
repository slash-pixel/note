import { classes } from "../data/classes";
import { matieres } from "../data/matieres";
import { enseignants } from "../data/enseignants";
import { eleves } from "../data/eleves";
import { affectationsCours } from "../data/affectations-cours";
import { ids } from "./ids";
import { genererMotDePasse } from "./password";

// ------------------------------------------------------------------
// Paramètres de l'année scolaire (non fournis par les Excel → à adapter)
// ------------------------------------------------------------------
export const LIBELLE_ANNEE = "2026-2027";
export const NB_TRIMESTRES = 3;
export const SEQUENCES_PAR_TRIMESTRE = 2;
/**
 * true  : séquences numérotées 1..6 sur l'année (T1 = séq. 1-2, T2 = séq. 3-4, T3 = séq. 5-6)
 * false : séquences numérotées 1..2 dans chaque trimestre
 */
export const NUMEROTATION_SEQUENCES_GLOBALE = true;

/** Construit toutes les lignes à insérer (pur, sans accès base) et valide les références croisées. */
export function construireDonnees() {
  const idAnnee = ids.annee(LIBELLE_ANNEE);

  // ---- Année / trimestres / séquences ------------------------------
  const annee = [{ id_annee: idAnnee, libelle_annee: LIBELLE_ANNEE, est_active: true }];
  const trimestres: { id_trimestre: string; numero_trimestre: number; id_annee: string }[] = [];
  const sequences: { id_sequence: string; numero_sequence: number; id_trimestre: string }[] = [];
  for (let t = 1; t <= NB_TRIMESTRES; t++) {
    const idTrimestre = ids.trimestre(LIBELLE_ANNEE, t);
    trimestres.push({ id_trimestre: idTrimestre, numero_trimestre: t, id_annee: idAnnee });
    for (let s = 1; s <= SEQUENCES_PAR_TRIMESTRE; s++) {
      const numero = NUMEROTATION_SEQUENCES_GLOBALE ? (t - 1) * SEQUENCES_PAR_TRIMESTRE + s : s;
      sequences.push({
        id_sequence: ids.sequence(LIBELLE_ANNEE, t, s),
        numero_sequence: numero,
        id_trimestre: idTrimestre,
      });
    }
  }

  // ---- Classes / matières ------------------------------------------
  const classesRows = classes.map((nom) => ({ id_classe: ids.classe(nom), nom_classe: nom }));
  const matieresRows = matieres.map((libelle) => ({ id_matiere: ids.matiere(libelle), libelle_matiere: libelle }));
  const setClasses = new Set(classes);
  const setMatieres = new Set(matieres);

  // ---- Enseignants ---------------------------------------------------
  const enseignantsRows = enseignants.map((e) => ({
    id_enseignant: ids.enseignant(e.nom_complet),
    nom_complet: e.nom_complet,
    mot_de_passe_clair: genererMotDePasse(e.nom, e.prenom), // sera haché dans seed.ts
    est_actif: true,
  }));
  const setEns = new Set(enseignants.map((e) => e.nom_complet));

  // ---- Élèves + affectation à leur classe ---------------------------
  const elevesRows = eleves.map((e) => ({
    id_eleve: ids.eleve(e.nom_complet),
    nom_complet: e.nom_complet,
    est_actif: true,
  }));
  const affectationsElevesRows = eleves.map((e) => {
    if (!setClasses.has(e.classe)) throw new Error(`Élève ${e.nom_complet}: classe inconnue "${e.classe}"`);
    return {
      id_affectation: ids.affectationEleve(e.nom_complet, LIBELLE_ANNEE),
      id_eleve: ids.eleve(e.nom_complet),
      id_classe: ids.classe(e.classe),
      id_annee: idAnnee,
    };
  });

  // ---- Affectations de cours ----------------------------------------
  const vus = new Set<string>();
  const affectationsCoursRows = affectationsCours.map((a) => {
    if (!setEns.has(a.enseignant)) throw new Error(`Enseignant inconnu: ${a.enseignant}`);
    if (!setMatieres.has(a.matiere)) throw new Error(`Matière inconnue: ${a.matiere}`);
    if (!setClasses.has(a.classe)) throw new Error(`Classe inconnue: ${a.classe}`);
    const cle = `${a.matiere}|${a.classe}`;
    if (vus.has(cle)) throw new Error(`Doublon matière/classe (contrainte unique) : ${cle}`);
    vus.add(cle);
    return {
      id_affectation_cours: ids.affectationCours(a.matiere, a.classe, LIBELLE_ANNEE),
      id_enseignant: ids.enseignant(a.enseignant),
      id_matiere: ids.matiere(a.matiere),
      id_classe: ids.classe(a.classe),
      id_annee: idAnnee,
    };
  });

  // ---- Contrôles d'unicité des ids (sécurité) -----------------------
  for (const [nom, rows, champ] of [
    ["élèves", elevesRows, "id_eleve"],
    ["enseignants", enseignantsRows, "id_enseignant"],
    ["classes", classesRows, "id_classe"],
    ["matières", matieresRows, "id_matiere"],
  ] as const) {
    const s = new Set((rows as Record<string, unknown>[]).map((r) => r[champ]));
    if (s.size !== rows.length) throw new Error(`Doublons détectés dans ${nom}`);
  }

  return {
    annee,
    trimestres,
    sequences,
    classes: classesRows,
    matieres: matieresRows,
    enseignants: enseignantsRows,
    eleves: elevesRows,
    affectationsEleves: affectationsElevesRows,
    affectationsCours: affectationsCoursRows,
  };
}
