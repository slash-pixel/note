-- AlterTable
ALTER TABLE "AffectationCours" ADD COLUMN     "coefficient" DECIMAL(5,2) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Classe" ADD COLUMN     "id_niveau" UUID;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "note_x_coefficient" DECIMAL(10,2) NOT NULL;

-- CreateTable
CREATE TABLE "Administrateur" (
    "id_admin" UUID NOT NULL,
    "nom_complet" TEXT NOT NULL,
    "email" TEXT,
    "mot_de_passe" TEXT NOT NULL,
    "est_actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Administrateur_pkey" PRIMARY KEY ("id_admin")
);

-- CreateTable
CREATE TABLE "ResultatTrimestriel" (
    "id_resultat" UUID NOT NULL,
    "id_eleve" UUID NOT NULL,
    "id_affectation_cours" UUID NOT NULL,
    "id_trimestre" UUID NOT NULL,
    "somme_notes" DECIMAL(10,2) NOT NULL,
    "moyenne_trimestrielle" DECIMAL(5,2) NOT NULL,
    "moyenne_x_coefficient" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ResultatTrimestriel_pkey" PRIMARY KEY ("id_resultat")
);

-- CreateTable
CREATE TABLE "VerrouillageNote" (
    "id_verrouillage" UUID NOT NULL,
    "id_affectation_cours" UUID NOT NULL,
    "id_sequence" UUID NOT NULL,
    "id_admin" UUID,
    "est_verrouille" BOOLEAN NOT NULL DEFAULT false,
    "date_verrouillage" TIMESTAMP(3),

    CONSTRAINT "VerrouillageNote_pkey" PRIMARY KEY ("id_verrouillage")
);

-- CreateTable
CREATE TABLE "Niveau" (
    "id_niveau" UUID NOT NULL,
    "libelle_niveau" TEXT NOT NULL,

    CONSTRAINT "Niveau_pkey" PRIMARY KEY ("id_niveau")
);

-- CreateTable
CREATE TABLE "ProgrammeNiveau" (
    "id_programme" UUID NOT NULL,
    "id_niveau" UUID NOT NULL,
    "id_matiere" UUID NOT NULL,

    CONSTRAINT "ProgrammeNiveau_pkey" PRIMARY KEY ("id_programme")
);

-- CreateIndex
CREATE UNIQUE INDEX "Administrateur_email_key" ON "Administrateur"("email");

-- CreateIndex
CREATE INDEX "ResultatTrimestriel_id_trimestre_idx" ON "ResultatTrimestriel"("id_trimestre");

-- CreateIndex
CREATE INDEX "ResultatTrimestriel_id_affectation_cours_idx" ON "ResultatTrimestriel"("id_affectation_cours");

-- CreateIndex
CREATE UNIQUE INDEX "ResultatTrimestriel_id_eleve_id_affectation_cours_id_trimes_key" ON "ResultatTrimestriel"("id_eleve", "id_affectation_cours", "id_trimestre");

-- CreateIndex
CREATE INDEX "VerrouillageNote_id_sequence_idx" ON "VerrouillageNote"("id_sequence");

-- CreateIndex
CREATE INDEX "VerrouillageNote_id_admin_idx" ON "VerrouillageNote"("id_admin");

-- CreateIndex
CREATE UNIQUE INDEX "VerrouillageNote_id_affectation_cours_id_sequence_key" ON "VerrouillageNote"("id_affectation_cours", "id_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Niveau_libelle_niveau_key" ON "Niveau"("libelle_niveau");

-- CreateIndex
CREATE INDEX "ProgrammeNiveau_id_matiere_idx" ON "ProgrammeNiveau"("id_matiere");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeNiveau_id_niveau_id_matiere_key" ON "ProgrammeNiveau"("id_niveau", "id_matiere");

-- AddForeignKey
ALTER TABLE "Classe" ADD CONSTRAINT "Classe_id_niveau_fkey" FOREIGN KEY ("id_niveau") REFERENCES "Niveau"("id_niveau") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultatTrimestriel" ADD CONSTRAINT "ResultatTrimestriel_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "Eleve"("id_eleve") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultatTrimestriel" ADD CONSTRAINT "ResultatTrimestriel_id_affectation_cours_fkey" FOREIGN KEY ("id_affectation_cours") REFERENCES "AffectationCours"("id_affectation_cours") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultatTrimestriel" ADD CONSTRAINT "ResultatTrimestriel_id_trimestre_fkey" FOREIGN KEY ("id_trimestre") REFERENCES "Trimestre"("id_trimestre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerrouillageNote" ADD CONSTRAINT "VerrouillageNote_id_affectation_cours_fkey" FOREIGN KEY ("id_affectation_cours") REFERENCES "AffectationCours"("id_affectation_cours") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerrouillageNote" ADD CONSTRAINT "VerrouillageNote_id_sequence_fkey" FOREIGN KEY ("id_sequence") REFERENCES "Sequence"("id_sequence") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerrouillageNote" ADD CONSTRAINT "VerrouillageNote_id_admin_fkey" FOREIGN KEY ("id_admin") REFERENCES "Administrateur"("id_admin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeNiveau" ADD CONSTRAINT "ProgrammeNiveau_id_niveau_fkey" FOREIGN KEY ("id_niveau") REFERENCES "Niveau"("id_niveau") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeNiveau" ADD CONSTRAINT "ProgrammeNiveau_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "Matiere"("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE;
