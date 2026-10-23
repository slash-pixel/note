#!/usr/bin/env python3
"""
Extrait les 5 fichiers Excel de l'école et génère les fichiers TypeScript de prisma/data/.

Usage :
    python3 extract_excel_to_ts.py <dossier_excels> <dossier_sortie>
    ex : python3 extract_excel_to_ts.py ./excels ../prisma/data

Dépendances : pandas, openpyxl

Principe : on n'extrait QUE ce qui sert au schéma Prisma (noms, classes, matières, affectations).
Aucun code du logiciel source n'est conservé ; les liens se font par les noms.

Règles :
- Année scolaire : 2026-2027 (définie dans prisma/lib/build.ts).
- Classe : chaque salle est une classe distincte (6ème M 1, 6ème M 2, 6ème M 3 = 3 classes).
  Les classes à salle unique gardent le nom de classe_scolaire (ex. 'Tle C').
- Matières : lignes vides et doublons ignorés.
- Enseignants : nom_complet = "NOM PRENOM". Doublon (même personne, nom/prénom inversés) -> un seul gardé.
- Affectations de cours : (enseignant, matière, classe) distincts de l'emploi du temps.
- Noms de matières de l'emploi du temps : suffixe '( Ecrite )' retiré pour retrouver la matière.
- Le XML des .xlsx contient 'biltinId' (faute de frappe) -> corrigé en mémoire pour pouvoir lire les fichiers.
"""
import io
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

import pandas as pd


# ---------------------------------------------------------------- lecture
def lire_excel(chemin: Path) -> pd.DataFrame:
    buf = io.BytesIO()
    with zipfile.ZipFile(chemin) as zin, zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/styles.xml":
                data = data.replace(b"biltinId", b"builtinId")
            zout.writestr(item, data)
    buf.seek(0)
    return pd.read_excel(buf, dtype=str)


def trouver(dossier: Path, debut: str) -> Path:
    cible = unicodedata.normalize("NFC", debut)
    for f in dossier.glob("*.xlsx"):
        if unicodedata.normalize("NFC", f.name).startswith(cible):
            return f
    raise FileNotFoundError(debut)


# ------------------------------------------------------------- utilitaires
def espaces(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip() if isinstance(s, str) else ""


def cle(s) -> str:
    """Clé de comparaison de noms (insensible à la casse, aux espaces et à l'apostrophe ’)."""
    return espaces(s).casefold().replace("’", "'")


def norm_classe(s: str) -> str:
    return re.sub(r"^(\d)\s+(ère|nde|ème)", r"\1\2", espaces(s), flags=re.I)


def split_salle(salle: str):
    """'6 ème M  2' -> ('6ème M', 2)"""
    s = norm_classe(salle)
    m = re.match(r"^(.*?)\s+(\d+)$", s)
    return (m.group(1), int(m.group(2))) if m else (s, 1)


def ts_array(nom, type_nom, rows):
    lignes = [f"export const {nom}: {type_nom}[] = ["]
    for r in rows:
        txt = json.dumps(r, ensure_ascii=False)
        if isinstance(r, dict):
            txt = re.sub(r'"([a-z_]+)": ', r"\1: ", txt)
            txt = "{ " + txt[1:-1] + " }"
        lignes.append("  " + txt + ",")
    lignes.append("];")
    return "\n".join(lignes) + "\n"


HEADER = "// ⚠️ Fichier généré par tools/extract_excel_to_ts.py — source : fichiers Excel de l'école.\n\n"


def ecrire(chemin: Path, contenu: str):
    chemin.write_text(HEADER + contenu, encoding="utf-8")
    print("écrit", chemin)


# ------------------------------------------------------------------ main
def main(src: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    rapport = []

    eleves = lire_excel(trouver(src, "élèves"))
    ens = lire_excel(trouver(src, "enseignants"))
    mat = lire_excel(trouver(src, "matières"))
    cls = lire_excel(trouver(src, "classe_scolaire"))
    edt = lire_excel(trouver(src, "emploi_du_temps"))

    # ---- Classes ------------------------------------------------------
    salles = set(map(split_salle, eleves["Salledeclasse"])) | set(map(split_salle, edt["Salledeclasse"]))
    groupes = {}
    for base, n in salles:
        groupes.setdefault(base, set()).add(n)

    def nom_classe(salle_brute):
        base, n = split_salle(salle_brute)
        return base if len(groupes[base]) == 1 else f"{base} {n}"

    noms_officiels = set(cls["Nomclasse"].map(norm_classe))
    inconnues = [b for b in groupes if b not in noms_officiels]
    assert not inconnues, f"Classes absentes de classe_scolaire.xlsx : {inconnues}"
    classes = {nom_classe(f"{b} {n}") for b, n in salles}
    for nom in sorted(noms_officiels - set(groupes)):
        classes.add(nom)
        rapport.append(f"Classe sans élève ni cours (présente dans classe_scolaire) : {nom}")
    classes = sorted(classes)

    # ---- Matières -----------------------------------------------------
    mat["libelle"] = mat["Nommatiere"].map(espaces)
    mat["code"] = mat["codematiere"].astype(int)
    mat = mat[mat["libelle"] != ""].sort_values("code").drop_duplicates("libelle")
    matieres = list(mat["libelle"])

    # ---- Emploi du temps : (enseignant, matière, classe) ---------------
    ens["nom"] = ens["Nom"].map(espaces)
    ens["prenom"] = ens["Prenom"].map(espaces)
    ens["nom_complet"] = (ens["nom"] + " " + ens["prenom"]).str.strip()
    par_cle = {cle(n): n for n in ens["nom_complet"]}

    def prof(r):
        # l'enseignant est dans l'une des deux colonnes (parfois permutées) : on prend celle qui est un nom connu
        for c in (r["codeenseignant"], r["Professeur"]):
            if cle(c) in par_cle:
                return par_cle[cle(c)]

    edt["enseignant"] = edt.apply(prof, axis=1)
    edt["matiere"] = edt["Matière"].map(lambda s: espaces(re.sub(r"\(.*?\)", "", s)))
    edt["classe"] = edt["Salledeclasse"].map(nom_classe)
    edt["ordre"] = edt["Codeeploiedutemps"].astype(int)  # sert uniquement à choisir en cas de conflit
    assert edt["enseignant"].notna().all(), "Enseignant introuvable pour certaines lignes de l'emploi du temps"
    inconnues_m = set(edt["matiere"]) - set(matieres)
    assert not inconnues_m, f"Matières absentes de matières.xlsx : {inconnues_m}"

    # ---- Enseignants : un seul exemplaire si doublon (nom/prénom inversés) --
    utilises = set(edt["enseignant"])
    gardes = {}
    for _, r in ens.sort_values("nom_complet").iterrows():
        signature = tuple(sorted(cle(r["nom_complet"]).split()))
        if signature in gardes:
            ancien = gardes[signature]
            if r["nom_complet"] in utilises and ancien["nom_complet"] not in utilises:
                gardes[signature], retire = r, ancien
            else:
                retire = r
            rapport.append(f"Doublon enseignant : gardé « {gardes[signature]['nom_complet']} », retiré « {retire['nom_complet']} »")
        else:
            gardes[signature] = r
    enseignants = [
        {"nom": r["nom"], "prenom": r["prenom"], "nom_complet": r["nom_complet"]}
        for r in sorted(gardes.values(), key=lambda r: r["nom_complet"])
    ]
    noms_gardes = {e["nom_complet"] for e in enseignants}
    # si l'emploi du temps pointait sur l'exemplaire retiré, on le redirige sur celui gardé
    redirection = {}
    for signature, r in gardes.items():
        for _, autre in ens.iterrows():
            if tuple(sorted(cle(autre["nom_complet"]).split())) == signature:
                redirection[autre["nom_complet"]] = r["nom_complet"]
    edt["enseignant"] = edt["enseignant"].map(redirection)

    # ---- Affectations de cours -----------------------------------------
    edt = edt.sort_values("ordre")
    aff = []
    for (classe, matiere), g in edt.groupby(["classe", "matiere"], sort=True):
        profs = list(dict.fromkeys(g["enseignant"]))
        aff.append({"enseignant": profs[0], "matiere": matiere, "classe": classe})
        if len(profs) > 1:
            rapport.append(
                f"⚠️ CONFLIT {classe} / {matiere} : {profs} -> retenu « {profs[0]} » "
                "(le schéma n'autorise qu'un enseignant par matière/classe/année)"
            )
    assert all(a["enseignant"] in noms_gardes for a in aff)

    # ---- Élèves ---------------------------------------------------------
    eleves["nom_complet"] = (eleves["Nom"].map(espaces) + " " + eleves["Prenom"].map(espaces)).str.strip()
    eleves["classe"] = eleves["Salledeclasse"].map(nom_classe)
    assert eleves["nom_complet"].is_unique, "Noms d'élèves en double"
    eleves_rows = [
        {"nom_complet": r["nom_complet"], "classe": r["classe"]}
        for _, r in eleves.sort_values(["classe", "nom_complet"]).iterrows()
    ]

    # ---- Écriture -------------------------------------------------------
    ecrire(out / "classes.ts", ts_array("classes", "string", classes))
    ecrire(out / "matieres.ts", ts_array("matieres", "string", matieres))
    ecrire(
        out / "enseignants.ts",
        "export interface EnseignantSource {\n  nom: string;\n  prenom: string;\n  /** \"NOM PRENOM\" : sert aussi de clé dans affectations-cours.ts */\n  nom_complet: string;\n}\n\n"
        + ts_array("enseignants", "EnseignantSource", enseignants),
    )
    ecrire(
        out / "eleves.ts",
        "export interface EleveSource {\n  nom_complet: string;\n  /** doit exister dans classes.ts */\n  classe: string;\n}\n\n"
        + ts_array("eleves", "EleveSource", eleves_rows),
    )
    ecrire(
        out / "affectations-cours.ts",
        "export interface AffectationCoursSource {\n  /** nom_complet d'un enseignant de enseignants.ts */\n  enseignant: string;\n"
        "  /** libellé d'une matière de matieres.ts */\n  matiere: string;\n  /** nom d'une classe de classes.ts */\n  classe: string;\n}\n\n"
        + ts_array("affectationsCours", "AffectationCoursSource", aff),
    )

    print("\n=== RAPPORT ===")
    print(f"classes={len(classes)} matieres={len(matieres)} enseignants={len(enseignants)} "
          f"eleves={len(eleves_rows)} affectations_cours={len(aff)}")
    for l in rapport:
        print("-", l)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
