import { createHash } from "node:crypto";

/**
 * UUID v5 déterministes : le même "nom" donne toujours le même UUID.
 * Avantage : le seed peut être relancé sans créer de doublons (createMany + skipDuplicates),
 * et on peut calculer les clés étrangères sans requête préalable en base.
 *
 * ⚠️ Ne pas changer NAMESPACE après une première insertion.
 */
const NAMESPACE = "6f0e5d3c-2b1a-4c8e-9a47-5d2f1e8b7c60";

export function uuidV5(name: string, namespace: string = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // variante RFC 4122
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export const ids = {
  annee: (libelle: string) => uuidV5(`annee:${libelle}`),
  trimestre: (libelleAnnee: string, numero: number) => uuidV5(`trimestre:${libelleAnnee}:${numero}`),
  sequence: (libelleAnnee: string, numeroTrimestre: number, numero: number) =>
    uuidV5(`sequence:${libelleAnnee}:${numeroTrimestre}:${numero}`),
  classe: (nom: string) => uuidV5(`classe:${nom}`),
  matiere: (libelle: string) => uuidV5(`matiere:${libelle}`),
  enseignant: (nomComplet: string) => uuidV5(`enseignant:${nomComplet}`),
  eleve: (nomComplet: string) => uuidV5(`eleve:${nomComplet}`),
  affectationEleve: (nomEleve: string, libelleAnnee: string) =>
    uuidV5(`affectation-eleve:${nomEleve}:${libelleAnnee}`),
  affectationCours: (matiere: string, classe: string, libelleAnnee: string) =>
    uuidV5(`affectation-cours:${matiere}:${classe}:${libelleAnnee}`),
};
