/*
  Warnings:

  - You are about to drop the column `matricule` on the `Eleve` table. All the data in the column will be lost.
  - You are about to drop the column `nom_eleve` on the `Eleve` table. All the data in the column will be lost.
  - You are about to drop the column `prenom_eleve` on the `Eleve` table. All the data in the column will be lost.
  - Added the required column `nom_complet` to the `Eleve` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Eleve" (
    "id_eleve" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom_complet" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Eleve" ("est_actif", "id_eleve") SELECT "est_actif", "id_eleve" FROM "Eleve";
DROP TABLE "Eleve";
ALTER TABLE "new_Eleve" RENAME TO "Eleve";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
