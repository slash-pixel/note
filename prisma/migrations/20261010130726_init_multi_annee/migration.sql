/*
  Warnings:

  - The primary key for the `AffectationCours` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id_classe` on the `Eleve` table. All the data in the column will be lost.
  - Added the required column `id_annee` to the `AffectationCours` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id_annee` to the `Trimestre` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "AnneeScolaire" (
    "id_annee" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_annee" TEXT NOT NULL,
    "est_active" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "AffectationEleve" (
    "id_eleve" INTEGER NOT NULL,
    "id_classe" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,

    PRIMARY KEY ("id_eleve", "id_annee"),
    CONSTRAINT "AffectationEleve_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve" ("id_eleve") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationEleve_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationEleve_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AffectationCours" (
    "id_enseignant" INTEGER NOT NULL,
    "id_matiere" INTEGER NOT NULL,
    "id_classe" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,

    PRIMARY KEY ("id_enseignant", "id_matiere", "id_classe", "id_annee"),
    CONSTRAINT "AffectationCours_id_enseignant_fkey" FOREIGN KEY ("id_enseignant") REFERENCES "Enseignant" ("id_enseignant") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere" ("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AffectationCours" ("id_classe", "id_enseignant", "id_matiere") SELECT "id_classe", "id_enseignant", "id_matiere" FROM "AffectationCours";
DROP TABLE "AffectationCours";
ALTER TABLE "new_AffectationCours" RENAME TO "AffectationCours";
CREATE TABLE "new_Eleve" (
    "id_eleve" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matricule" TEXT NOT NULL,
    "nom_eleve" TEXT NOT NULL,
    "prenom_eleve" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Eleve" ("id_eleve", "matricule", "nom_eleve", "prenom_eleve") SELECT "id_eleve", "matricule", "nom_eleve", "prenom_eleve" FROM "Eleve";
DROP TABLE "Eleve";
ALTER TABLE "new_Eleve" RENAME TO "Eleve";
CREATE UNIQUE INDEX "Eleve_matricule_key" ON "Eleve"("matricule");
CREATE TABLE "new_Enseignant" (
    "id_enseignant" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom_enseignant" TEXT NOT NULL,
    "prenom_enseignant" TEXT NOT NULL,
    "email_login" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Enseignant" ("email_login", "id_enseignant", "mot_de_passe", "nom_enseignant", "prenom_enseignant") SELECT "email_login", "id_enseignant", "mot_de_passe", "nom_enseignant", "prenom_enseignant" FROM "Enseignant";
DROP TABLE "Enseignant";
ALTER TABLE "new_Enseignant" RENAME TO "Enseignant";
CREATE UNIQUE INDEX "Enseignant_email_login_key" ON "Enseignant"("email_login");
CREATE TABLE "new_Trimestre" (
    "id_trimestre" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_trimestre" TEXT NOT NULL,
    "id_annee" INTEGER NOT NULL,
    CONSTRAINT "Trimestre_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Trimestre" ("id_trimestre", "libelle_trimestre") SELECT "id_trimestre", "libelle_trimestre" FROM "Trimestre";
DROP TABLE "Trimestre";
ALTER TABLE "new_Trimestre" RENAME TO "Trimestre";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AnneeScolaire_libelle_annee_key" ON "AnneeScolaire"("libelle_annee");
