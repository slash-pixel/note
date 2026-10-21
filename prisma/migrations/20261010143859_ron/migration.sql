/*
  Warnings:

  - You are about to drop the column `email_login` on the `Enseignant` table. All the data in the column will be lost.
  - You are about to drop the column `nom_enseignant` on the `Enseignant` table. All the data in the column will be lost.
  - You are about to drop the column `prenom_enseignant` on the `Enseignant` table. All the data in the column will be lost.
  - You are about to drop the column `libelle_sequence` on the `Sequence` table. All the data in the column will be lost.
  - You are about to drop the column `libelle_trimestre` on the `Trimestre` table. All the data in the column will be lost.
  - Added the required column `nom_complet` to the `Enseignant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numero_sequence` to the `Sequence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numero_trimestre` to the `Trimestre` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Enseignant" (
    "id_enseignant" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom_complet" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Enseignant" ("est_actif", "id_enseignant", "mot_de_passe") SELECT "est_actif", "id_enseignant", "mot_de_passe" FROM "Enseignant";
DROP TABLE "Enseignant";
ALTER TABLE "new_Enseignant" RENAME TO "Enseignant";
CREATE TABLE "new_Sequence" (
    "id_sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero_sequence" INTEGER NOT NULL,
    "id_trimestre" INTEGER NOT NULL,
    CONSTRAINT "Sequence_id_trimestre_fkey" FOREIGN KEY ("id_trimestre") REFERENCES "Trimestre" ("id_trimestre") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sequence" ("id_sequence", "id_trimestre") SELECT "id_sequence", "id_trimestre" FROM "Sequence";
DROP TABLE "Sequence";
ALTER TABLE "new_Sequence" RENAME TO "Sequence";
CREATE TABLE "new_Trimestre" (
    "id_trimestre" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero_trimestre" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,
    CONSTRAINT "Trimestre_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Trimestre" ("id_annee", "id_trimestre") SELECT "id_annee", "id_trimestre" FROM "Trimestre";
DROP TABLE "Trimestre";
ALTER TABLE "new_Trimestre" RENAME TO "Trimestre";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
