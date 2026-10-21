-- CreateTable
CREATE TABLE "Trimestre" (
    "id_trimestre" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_trimestre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id_sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_sequence" TEXT NOT NULL,
    "id_trimestre" INTEGER NOT NULL,
    CONSTRAINT "Sequence_id_trimestre_fkey" FOREIGN KEY ("id_trimestre") REFERENCES "Trimestre" ("id_trimestre") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Classe" (
    "id_classe" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom_classe" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Eleve" (
    "id_eleve" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matricule" TEXT NOT NULL,
    "nom_eleve" TEXT NOT NULL,
    "prenom_eleve" TEXT NOT NULL,
    "id_classe" INTEGER NOT NULL,
    CONSTRAINT "Eleve_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Matiere" (
    "id_matiere" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle_matiere" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Enseignant" (
    "id_enseignant" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom_enseignant" TEXT NOT NULL,
    "prenom_enseignant" TEXT NOT NULL,
    "email_login" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AffectationCours" (
    "id_enseignant" INTEGER NOT NULL,
    "id_matiere" INTEGER NOT NULL,
    "id_classe" INTEGER NOT NULL,

    PRIMARY KEY ("id_enseignant", "id_matiere", "id_classe"),
    CONSTRAINT "AffectationCours_id_enseignant_fkey" FOREIGN KEY ("id_enseignant") REFERENCES "Enseignant" ("id_enseignant") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere" ("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AffectationCours_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe" ("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id_eleve" INTEGER NOT NULL,
    "id_matiere" INTEGER NOT NULL,
    "id_sequence" INTEGER NOT NULL,
    "valeur_note" REAL NOT NULL,

    PRIMARY KEY ("id_eleve", "id_matiere", "id_sequence"),
    CONSTRAINT "Note_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve" ("id_eleve") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Note_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere" ("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Note_id_sequence_fkey" FOREIGN KEY ("id_sequence") REFERENCES "Sequence" ("id_sequence") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Eleve_matricule_key" ON "Eleve"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "Enseignant_email_login_key" ON "Enseignant"("email_login");
