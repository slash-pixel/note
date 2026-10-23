/**
 * Insertion des données de l'école dans PostgreSQL via Prisma.
 *
 *   npx tsx prisma/seed.ts          (ou : npx prisma db seed)
 *
 * - Idempotent : IDs déterministes + createMany({ skipDuplicates: true }) → relançable sans doublons.
 * - Ordre respectant les clés étrangères (onDelete: Restrict).
 * - Les mots de passe enseignants sont hachés avec bcrypt avant insertion.
 * - Ne supprime rien. Un enseignant/élève déjà présent n'est PAS mis à jour.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { construireDonnees } from "./lib/build";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;
const TAILLE_LOT = 500;

async function parLots<T>(
  libelle: string,
  rows: T[],
  inserer: (lot: T[]) => Promise<{ count: number }>,
) {
  let insere = 0;
  for (let i = 0; i < rows.length; i += TAILLE_LOT) {
    const { count } = await inserer(rows.slice(i, i + TAILLE_LOT));
    insere += count;
  }
  const ignores = rows.length - insere;
  console.log(
    `  ✔ ${libelle.padEnd(22)} ${String(insere).padStart(4)} insérés` +
      (ignores > 0 ? `, ${ignores} déjà présents (ignorés)` : ""),
  );
}

async function main() {
  const d = construireDonnees(); // valide les références avant toute écriture
  console.log("🚀 Insertion en base…");

  // 1. Structuration temporelle
  await parLots("AnneeScolaire", d.annee, (data) => prisma.anneeScolaire.createMany({ data, skipDuplicates: true }));
  await parLots("Trimestre", d.trimestres, (data) => prisma.trimestre.createMany({ data, skipDuplicates: true }));
  await parLots("Sequence", d.sequences, (data) => prisma.sequence.createMany({ data, skipDuplicates: true }));

  // 2. Structures académiques
  await parLots("Classe", d.classes, (data) => prisma.classe.createMany({ data, skipDuplicates: true }));
  await parLots("Matiere", d.matieres, (data) => prisma.matiere.createMany({ data, skipDuplicates: true }));

  const enseignants = await Promise.all(
    d.enseignants.map(async ({ mot_de_passe_clair, ...e }) => ({
      ...e,
      mot_de_passe: await bcrypt.hash(mot_de_passe_clair, BCRYPT_ROUNDS),
    })),
  );
  await parLots("Enseignant", enseignants, (data) => prisma.enseignant.createMany({ data, skipDuplicates: true }));
  await parLots("Eleve", d.eleves, (data) => prisma.eleve.createMany({ data, skipDuplicates: true }));

  // 3. Affectations (dépendent de tout ce qui précède)
  await parLots("AffectationEleve", d.affectationsEleves, (data) =>
    prisma.affectationEleve.createMany({ data, skipDuplicates: true }),
  );
  await parLots("AffectationCours", d.affectationsCours, (data) =>
    prisma.affectationCours.createMany({ data, skipDuplicates: true }),
  );

  console.log("🎉 Terminé.");
}

main()
  .catch((e) => {
    console.error("❌ Échec du seed :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
