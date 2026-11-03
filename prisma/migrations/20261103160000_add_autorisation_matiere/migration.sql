CREATE TABLE "AutorisationMatiere" (
    "id_autorisation" UUID NOT NULL,
    "id_enseignant" UUID NOT NULL,
    "id_matiere" UUID NOT NULL,
    CONSTRAINT "AutorisationMatiere_pkey" PRIMARY KEY ("id_autorisation")
);

CREATE INDEX "AutorisationMatiere_id_matiere_idx"
ON "AutorisationMatiere"("id_matiere");

CREATE UNIQUE INDEX "AutorisationMatiere_id_enseignant_id_matiere_key"
ON "AutorisationMatiere"("id_enseignant", "id_matiere");

ALTER TABLE "AutorisationMatiere"
ADD CONSTRAINT "AutorisationMatiere_id_enseignant_fkey"
FOREIGN KEY ("id_enseignant")
REFERENCES "Enseignant"("id_enseignant")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutorisationMatiere"
ADD CONSTRAINT "AutorisationMatiere_id_matiere_fkey"
FOREIGN KEY ("id_matiere")
REFERENCES "Matiere"("id_matiere")
ON DELETE RESTRICT ON UPDATE CASCADE;