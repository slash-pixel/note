-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AffectationCours" (
    "id_enseignant" INTEGER NOT NULL,
    "id_matiere" INTEGER NOT NULL,
    "id_classe" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,

    PRIMARY KEY ("id_enseignant", "id_matiere", "id_classe", "id_annee"),
    CONSTRAINT "AffectationCours_id_enseignant_fkey" FOREIGN KEY ("id_enseignant") REFERENCES "Enseignant" ("id_enseignant") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere" ("id_matiere") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AffectationCours" ("id_annee", "id_classe", "id_enseignant", "id_matiere") SELECT "id_annee", "id_classe", "id_enseignant", "id_matiere" FROM "AffectationCours";
DROP TABLE "AffectationCours";
ALTER TABLE "new_AffectationCours" RENAME TO "AffectationCours";
CREATE TABLE "new_AffectationEleve" (
    "id_eleve" INTEGER NOT NULL,
    "id_classe" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,

    PRIMARY KEY ("id_eleve", "id_annee"),
    CONSTRAINT "AffectationEleve_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve" ("id_eleve") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffectationEleve_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffectationEleve_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AffectationEleve" ("id_annee", "id_classe", "id_eleve") SELECT "id_annee", "id_classe", "id_eleve" FROM "AffectationEleve";
DROP TABLE "AffectationEleve";
ALTER TABLE "new_AffectationEleve" RENAME TO "AffectationEleve";
CREATE TABLE "new_Note" (
    "id_eleve" INTEGER NOT NULL,
    "id_matiere" INTEGER NOT NULL,
    "id_sequence" INTEGER NOT NULL,
    "valeur_note" REAL NOT NULL,

    PRIMARY KEY ("id_eleve", "id_matiere", "id_sequence"),
    CONSTRAINT "Note_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve" ("id_eleve") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere" ("id_matiere") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_id_sequence_fkey" FOREIGN KEY ("id_sequence") REFERENCES "Sequence" ("id_sequence") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("id_eleve", "id_matiere", "id_sequence", "valeur_note") SELECT "id_eleve", "id_matiere", "id_sequence", "valeur_note" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE TABLE "new_Sequence" (
    "id_sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero_sequence" INTEGER NOT NULL,
    "id_trimestre" INTEGER NOT NULL,
    CONSTRAINT "Sequence_id_trimestre_fkey" FOREIGN KEY ("id_trimestre") REFERENCES "Trimestre" ("id_trimestre") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sequence" ("id_sequence", "id_trimestre", "numero_sequence") SELECT "id_sequence", "id_trimestre", "numero_sequence" FROM "Sequence";
DROP TABLE "Sequence";
ALTER TABLE "new_Sequence" RENAME TO "Sequence";
CREATE TABLE "new_Trimestre" (
    "id_trimestre" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero_trimestre" INTEGER NOT NULL,
    "id_annee" INTEGER NOT NULL,
    CONSTRAINT "Trimestre_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire" ("id_annee") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Trimestre" ("id_annee", "id_trimestre", "numero_trimestre") SELECT "id_annee", "id_trimestre", "numero_trimestre" FROM "Trimestre";
DROP TABLE "Trimestre";
ALTER TABLE "new_Trimestre" RENAME TO "Trimestre";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
