import { classes } from "../data/classes";
import { matieres } from "../data/matieres";
import { enseignants } from "../data/enseignants";
import { eleves } from "../data/eleves";
import { affectationsCours } from "../data/affectations-cours";
import { ids } from "./ids";
import { genererMotDePasse } from "./password";

export const LIBELLE_ANNEE = "2026-2027";
export const NB_TRIMESTRES = 3;
export const SEQUENCES_PAR_TRIMESTRE = 2;
export const NUMEROTATION_SEQUENCES_GLOBALE = true;

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function obtenirCoefficient(classe: string, matiere: string): number {
  const c = classe.trim();
  const m = matiere.toUpperCase();

  if (c.startsWith("6 ème") || c.startsWith("6ème") || c.startsWith("5 ème") || c.startsWith("5ème")) {
    if (m === "FRANCAIS" || m === "LANGUE FRANCAISE") return 6;
    if (m === "ANGLAIS") return 5;
    if (m === "MATHEMATIQUES") return 4;
    if (m === "HIST/GEO" || m === "HISTOIRE" || m === "GEOGRAPHIE") return 4;
    if (m === "SVTEEHB" || m === "SCIENCES" || m === "ST") return 2;
    if (m === "ECM" || m === "EDUCATION A LA CITOYENNETE") return 2;
    if (m === "INFORMATIQUE") return 2;
    if (m === "EPS") return 2;
    if (m === "LANGUE NATIONALE" || m === "CULTURE NATIONALE" || m === "LANGUE/CULTURE NATIONALE") return 2;
    if (m === "TRAVAIL MANUEL" || m === "TM" || m === "ESF" || m === "EVA" || m === "EDUCION ARTISTIQUE" || m === "MUSIQUE" || m === "LATIN") return 1;
    return 1;
  }

  if (c.startsWith("4 ème") || c.startsWith("4ème") || c.startsWith("3 ème") || c.startsWith("3ème")) {
    if (m === "FRANCAIS" || m === "LANGUE FRANCAISE") return 6;
    if (m === "ANGLAIS") return 5;
    if (m === "MATHEMATIQUES") return 4;
    if (m === "HIST/GEO" || m === "HISTOIRE" || m === "GEOGRAPHIE") return 4;
    if (m === "ALLEMAND" || m === "ESPAGNOL" || m.includes("LV")) return 3;
    if (m === "PHYSIQUES" || m === "CHIMIES" || m === "PCT") return c.includes("3") ? 3 : 2;
    if (m === "SVTEEHB" || m === "SCIENCES") return 2;
    if (m === "ECM") return 2;
    if (m === "INFORMATIQUE") return 2;
    if (m === "EPS") return 2;
    return 1;
  }

  if (c.startsWith("2 nde") || c.startsWith("2nde")) {
    if (c.includes("C")) {
      if (m === "MATHEMATIQUES") return 5;
      if (m === "PHYSIQUES" || m === "PHYSIQUE") return 3;
      if (m === "SVTEEHB" || m === "SCIENCES") return 3;
      if (m === "CHIMIES" || m === "CHIMIE") return 2;
      if (m === "INFORMATIQUE") return 2;
      if (m === "ANGLAIS" || m.includes("FRANCAIS") || m === "LITTERATURE") return 3;
      if (m === "HIST/GEO" || (m.includes("HIST") && m.includes("GEO"))) return 4;
      if (m === "EPS") return 2;
      return 1;
    } else {
      if (m === "ANGLAIS") return 4;
      if (m === "LITTERATURE" || m === "ALLEMAND" || m === "ESPAGNOL") return 3;
      if (m === "FRANCAIS" || m === "LANGUE FRANCAISE" || m === "PHILOSOPHIE" || m === "HISTOIRE" || m === "GEOGRAPHIE" || m === "ECM" || m === "MATHEMATIQUES" || m === "INFORMATIQUE" || m === "EPS") return 2;
      return 1;
    }
  }

  if (c.includes("1ère") || c.includes("1 ère") || c.includes("P A4")) {
    if (c.includes("C")) {
      if (m === "MATHEMATIQUES") return 6;
      if (m === "PHYSIQUES" || m === "PHYSIQUE") return 4;
      if (m === "SVTEEHB") return 2;
      if (m === "CHIMIES" || m === "CHIMIE") return 2;
      if (m === "INFORMATIQUE") return 2;
      if (m === "ANGLAIS" || m.includes("FRANCAIS") || m === "LITTERATURE") return 3;
      if (m === "HIST/GEO") return 3;
      if (m === "EPS") return 2;
      return 1;
    } else if (c.includes("D")) {
      if (m === "SVTEEHB") return 6;
      if (m === "MATHEMATIQUES") return 4;
      if (m === "PHYSIQUES" || m === "CHIMIES") return 2;
      if (m === "INFORMATIQUE") return 2;
      if (m === "ANGLAIS" || m.includes("FRANCAIS") || m === "LITTERATURE") return 3;
      if (m === "HIST/GEO") return 3;
      if (m === "EPS") return 2;
      return 1;
    } else {
      if (m === "ANGLAIS") return 4;
      if (m === "LITTERATURE" || m === "ALLEMAND" || m === "ESPAGNOL") return 3;
      if (m === "FRANCAIS" || m === "PHILOSOPHIE" || m === "HISTOIRE" || m === "GEOGRAPHIE" || m === "ECM" || m === "MATHEMATIQUES" || m === "INFORMATIQUE" || m === "EPS") return 2;
      return 1;
    }
  }

  if (c.startsWith("Tle")) {
    if (c.includes("C")) {
      if (m === "MATHEMATIQUES") return 7;
      if (m === "PHYSIQUES" || m === "PHYSIQUE") return 4;
      if (m === "SVTEEHB") return 2;
      if (m === "CHIMIES" || m === "CHIMIE") return 2;
      if (m === "INFORMATIQUE") return 2;
      if (m === "ANGLAIS" || m.includes("FRANCAIS") || m === "LITTERATURE") return 3;
      if (m === "PHILOSOPHIE") return 2;
      if (m === "EPS") return 2;
      return 1;
    } else if (c.includes("D")) {
      if (m === "SVTEEHB") return 6;
      if (m === "MATHEMATIQUES") return 4;
      if (m === "PHYSIQUES" || m === "CHIMIES") return 2;
      if (m === "INFORMATIQUE") return 2;
      if (m === "ANGLAIS" || m.includes("FRANCAIS") || m === "LITTERATURE") return 3;
      if (m === "PHILOSOPHIE") return 2;
      if (m === "EPS") return 2;
      return 1;
    } else {
      if (m === "PHILOSOPHIE") return 4;
      if (m === "ANGLAIS") return 4;
      if (m === "LITTERATURE" || m === "ALLEMAND" || m === "ESPAGNOL") return 3;
      if (m === "FRANCAIS" || m === "HISTOIRE" || m === "GEOGRAPHIE" || m === "ECM" || m === "MATHEMATIQUES" || m === "INFORMATIQUE" || m === "EPS") return 2;
      return 1;
    }
  }

  return 1;
}

export function construireDonnees() {
  const idAnnee = ids.annee(LIBELLE_ANNEE);

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

  const classesRows = classes.map((nom) => ({ id_classe: ids.classe(nom), nom_classe: nom }));
  const matieresRows = matieres.map((libelle) => ({ id_matiere: ids.matiere(libelle), libelle_matiere: libelle }));
  
  const mapClasses = new Map<string, string>();
  for (const nom of classes) {
    mapClasses.set(normaliser(nom), nom);
  }

  function trouverClasseOfficielle(classeBrute: string): string {
    const norm = normaliser(classeBrute);
    if (mapClasses.has(norm)) {
      return mapClasses.get(norm)!;
    }
    const sansChiffreFin = norm.replace(/\d+$/, "");
    if (mapClasses.has(sansChiffreFin)) {
      return mapClasses.get(sansChiffreFin)!;
    }
    for (const [key, officielle] of mapClasses.entries()) {
      if (norm.includes(key) || key.includes(norm)) {
        return officielle;
      }
    }
    throw new Error(`Classe introuvable : "${classeBrute}"`);
  }

  const enseignantsMap = new Map<string, { nom: string; prenom: string; nom_complet: string }>();
  for (const e of enseignants) {
    enseignantsMap.set(e.nom_complet, e);
  }
  for (const a of affectationsCours) {
    if (!enseignantsMap.has(a.enseignant)) {
      const parties = a.enseignant.split(" ");
      const nom = parties[parties.length - 1] || "Prof";
      const prenom = parties.slice(0, parties.length - 1).join(" ") || "Enseignant";
      enseignantsMap.set(a.enseignant, { nom_complet: a.enseignant, nom, prenom });
    }
  }

  const enseignantsRows = Array.from(enseignantsMap.values()).map((e) => ({
    id_enseignant: ids.enseignant(e.nom_complet),
    nom_complet: e.nom_complet,
    mot_de_passe_clair: genererMotDePasse(e.nom, e.prenom),
    est_actif: true,
  }));
  const setEns = new Set(enseignantsMap.keys());

  const elevesRows = eleves.map((e) => ({
    id_eleve: ids.eleve(e.nom_complet),
    nom_complet: e.nom_complet,
    est_actif: true,
  }));

  const affectationsElevesRows = eleves.map((e) => {
    let classeOfficielle: string;
    try {
      classeOfficielle = trouverClasseOfficielle(e.classe);
    } catch {
      throw new Error(`Élève ${e.nom_complet}: classe inconnue "${e.classe}"`);
    }
    return {
      id_affectation: ids.affectationEleve(e.nom_complet, LIBELLE_ANNEE),
      id_eleve: ids.eleve(e.nom_complet),
      id_classe: ids.classe(classeOfficielle),
      id_annee: idAnnee,
    };
  });

  // --- Contrôle strict : interdiction absolue des doublons matière/classe ---
  const vus = new Set<string>();
  const affectationsCoursRows = affectationsCours.map((a) => {
    if (!setEns.has(a.enseignant)) throw new Error(`Enseignant inconnu: ${a.enseignant}`);
    if (!matieres.includes(a.matiere)) throw new Error(`Matière inconnue: ${a.matiere}`);
    
    let classeOfficielle: string;
    try {
      classeOfficielle = trouverClasseOfficielle(a.classe);
    } catch {
      throw new Error(`Classe inconnue dans les cours : "${a.classe}"`);
    }

    const cle = `${a.matiere}|${classeOfficielle}`;
    if (vus.has(cle)) {
      throw new Error(`Doublon détecté : La matière "${a.matiere}" est affectée plusieurs fois dans la classe "${classeOfficielle}" (Enseignant concerné : ${a.enseignant})`);
    }
    vus.add(cle);

    return {
      id_affectation_cours: ids.affectationCours(a.matiere, classeOfficielle, LIBELLE_ANNEE),
      id_enseignant: ids.enseignant(a.enseignant),
      id_matiere: ids.matiere(a.matiere),
      id_classe: ids.classe(classeOfficielle),
      id_annee: idAnnee,
      coefficient: obtenirCoefficient(classeOfficielle, a.matiere),
    };
  });

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