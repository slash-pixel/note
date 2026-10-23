/**
 * Vérifie les données SANS toucher à la base.
 *   npx tsx prisma/check-data.ts              -> résumé + validations
 *   npx tsx prisma/check-data.ts --passwords  -> + liste "enseignant -> mot de passe initial"
 */
import { construireDonnees } from "./lib/build";

const d = construireDonnees();

console.log("✅ Données valides et cohérentes\n");
console.table({
  "Année scolaire": d.annee.length,
  Trimestres: d.trimestres.length,
  Séquences: d.sequences.length,
  Classes: d.classes.length,
  Matières: d.matieres.length,
  Enseignants: d.enseignants.length,
  Élèves: d.eleves.length,
  "Affectations élèves": d.affectationsEleves.length,
  "Affectations cours": d.affectationsCours.length,
});

if (process.argv.includes("--passwords")) {
  console.log("\nMots de passe initiaux des enseignants (à communiquer puis faire changer) :");
  console.table(d.enseignants.map((e) => ({ enseignant: e.nom_complet, mot_de_passe: e.mot_de_passe_clair })));
}
