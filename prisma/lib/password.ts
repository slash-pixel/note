/** Garde uniquement les lettres A-Z (sans accents, espaces, apostrophes, tirets…), en majuscules. */
function lettres(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

/**
 * Règle des mots de passe enseignants :
 *  - nom ≠ prénom : 3 premières lettres du nom + 2 premières lettres du prénom + ".ENS25"
 *      ex. MATIKE HUNNO / OSCAR DÉSIRÉ  ->  MATOS.ENS25
 *  - nom = prénom : 3 premières lettres du nom + ".ENS25"
 *      ex. JUMACHE / JUMACHE            ->  JUM.ENS25
 * Tout en majuscules.
 */
export function genererMotDePasse(nom: string, prenom: string): string {
  const n = lettres(nom);
  const p = lettres(prenom);
  if (n.length === 0) throw new Error(`Nom vide, impossible de générer un mot de passe (${nom}/${prenom})`);
  if (n === p || p.length === 0) return `${n.slice(0, 3)}.ENS25`;
  return `${n.slice(0, 3)}${p.slice(0, 2)}.ENS25`;
}
