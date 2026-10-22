-- CreateTable
CREATE TABLE "AnneeScolaire" (
    "id_annee" UUID NOT NULL,
    "libelle_annee" TEXT NOT NULL,
    "est_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnneeScolaire_pkey" PRIMARY KEY ("id_annee")
);

-- CreateTable
CREATE TABLE "Trimestre" (
    "id_trimestre" UUID NOT NULL,
    "numero_trimestre" INTEGER NOT NULL,
    "id_annee" UUID NOT NULL,

    CONSTRAINT "Trimestre_pkey" PRIMARY KEY ("id_trimestre")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id_sequence" UUID NOT NULL,
    "numero_sequence" INTEGER NOT NULL,
    "id_trimestre" UUID NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id_sequence")
);

-- CreateTable
CREATE TABLE "Classe" (
    "id_classe" UUID NOT NULL,
    "nom_classe" TEXT NOT NULL,

    CONSTRAINT "Classe_pkey" PRIMARY KEY ("id_classe")
);

-- CreateTable
CREATE TABLE "Eleve" (
    "id_eleve" UUID NOT NULL,
    "nom_complet" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Eleve_pkey" PRIMARY KEY ("id_eleve")
);

-- CreateTable
CREATE TABLE "Matiere" (
    "id_matiere" UUID NOT NULL,
    "libelle_matiere" TEXT NOT NULL,

    CONSTRAINT "Matiere_pkey" PRIMARY KEY ("id_matiere")
);

-- CreateTable
CREATE TABLE "Enseignant" (
    "id_enseignant" UUID NOT NULL,
    "nom_complet" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Enseignant_pkey" PRIMARY KEY ("id_enseignant")
);

-- CreateTable
CREATE TABLE "AffectationEleve" (
    "id_affectation" UUID NOT NULL,
    "id_eleve" UUID NOT NULL,
    "id_classe" UUID NOT NULL,
    "id_annee" UUID NOT NULL,

    CONSTRAINT "AffectationEleve_pkey" PRIMARY KEY ("id_affectation")
);

-- CreateTable
CREATE TABLE "AffectationCours" (
    "id_affectation_cours" UUID NOT NULL,
    "id_enseignant" UUID NOT NULL,
    "id_matiere" UUID NOT NULL,
    "id_classe" UUID NOT NULL,
    "id_annee" UUID NOT NULL,

    CONSTRAINT "AffectationCours_pkey" PRIMARY KEY ("id_affectation_cours")
);

-- CreateTable
CREATE TABLE "Note" (
    "id_note" UUID NOT NULL,
    "id_eleve" UUID NOT NULL,
    "id_affectation_cours" UUID NOT NULL,
    "id_sequence" UUID NOT NULL,
    "valeur_note" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id_note")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnneeScolaire_libelle_annee_key" ON "AnneeScolaire"("libelle_annee");

-- CreateIndex
CREATE UNIQUE INDEX "Trimestre_id_annee_numero_trimestre_key" ON "Trimestre"("id_annee", "numero_trimestre");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_id_trimestre_numero_sequence_key" ON "Sequence"("id_trimestre", "numero_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Classe_nom_classe_key" ON "Classe"("nom_classe");

-- CreateIndex
CREATE UNIQUE INDEX "Matiere_libelle_matiere_key" ON "Matiere"("libelle_matiere");

-- CreateIndex
CREATE INDEX "AffectationEleve_id_classe_id_annee_idx" ON "AffectationEleve"("id_classe", "id_annee");

-- CreateIndex
CREATE UNIQUE INDEX "AffectationEleve_id_eleve_id_annee_key" ON "AffectationEleve"("id_eleve", "id_annee");

-- CreateIndex
CREATE INDEX "AffectationCours_id_classe_id_annee_idx" ON "AffectationCours"("id_classe", "id_annee");

-- CreateIndex
CREATE INDEX "AffectationCours_id_enseignant_id_annee_idx" ON "AffectationCours"("id_enseignant", "id_annee");

-- CreateIndex
CREATE UNIQUE INDEX "AffectationCours_id_matiere_id_classe_id_annee_key" ON "AffectationCours"("id_matiere", "id_classe", "id_annee");

-- CreateIndex
CREATE INDEX "Note_id_sequence_idx" ON "Note"("id_sequence");

-- CreateIndex
CREATE INDEX "Note_id_affectation_cours_idx" ON "Note"("id_affectation_cours");

-- CreateIndex
CREATE UNIQUE INDEX "Note_id_eleve_id_affectation_cours_id_sequence_key" ON "Note"("id_eleve", "id_affectation_cours", "id_sequence");

-- AddForeignKey
ALTER TABLE "Trimestre" ADD CONSTRAINT "Trimestre_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire"("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_id_trimestre_fkey" FOREIGN KEY ("id_trimestre") REFERENCES "Trimestre"("id_trimestre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationEleve" ADD CONSTRAINT "AffectationEleve_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve"("id_eleve") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationEleve" ADD CONSTRAINT "AffectationEleve_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe"("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationEleve" ADD CONSTRAINT "AffectationEleve_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire"("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCours" ADD CONSTRAINT "AffectationCours_id_enseignant_fkey" FOREIGN KEY ("id_enseignant") REFERENCES "Enseignant"("id_enseignant") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCours" ADD CONSTRAINT "AffectationCours_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere"("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCours" ADD CONSTRAINT "AffectationCours_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "Classe"("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCours" ADD CONSTRAINT "AffectationCours_id_annee_fkey" FOREIGN KEY ("id_annee") REFERENCES "AnneeScolaire"("id_annee") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve"("id_eleve") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_id_affectation_cours_fkey" FOREIGN KEY ("id_affectation_cours") REFERENCES "AffectationCours"("id_affectation_cours") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_id_sequence_fkey" FOREIGN KEY ("id_sequence") REFERENCES "Sequence"("id_sequence") ON DELETE RESTRICT ON UPDATE CASCADE;
