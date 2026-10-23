// src/routes/notes.ts
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

type JwtPayload = {
  id_enseignant: string;
  nom_complet: string;
  exp: number;
};

const prisma = new PrismaClient();
const notesApp = new Hono<{ Variables: { jwtPayload: JwtPayload } }>();
const JWT_SECRET = process.env.JWT_SECRET || 'cle-secrete-super-securisee';

const uuid = z.string().uuid();

// -----------------------------------------------------------------------------
// OUTILS
// -----------------------------------------------------------------------------

const getAnneeActive = () =>
  prisma.anneeScolaire.findFirst({ where: { est_active: true } });

const affectationDeLEnseignant = async (
  id_enseignant: string,
  id_matiere: string,
  id_classe: string,
  id_annee: string
) => {
  const affectation = await prisma.affectationCours.findUnique({
    where: {
      id_matiere_id_classe_id_annee: { id_matiere, id_classe, id_annee }
    }
  });
  return affectation && affectation.id_enseignant === id_enseignant
    ? affectation
    : null;
};

const sequenceDansAnnee = (id_sequence: string, id_annee: string) =>
  prisma.sequence.findFirst({
    where: { id_sequence, trimestre: { id_annee } }
  });

// -----------------------------------------------------------------------------
// 1. ENDPOINTS POUR LE FORMULAIRE DE CONNEXION (Listes dynamiques)
// -----------------------------------------------------------------------------

notesApp.get('/trimestres', async (c) => {
  const anneeActive = await getAnneeActive();
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const trimestres = await prisma.trimestre.findMany({
    where: { id_annee: anneeActive.id_annee },
    orderBy: { numero_trimestre: 'asc' },
    include: { sequences: { orderBy: { numero_sequence: 'asc' } } }
  });
  return c.json(trimestres);
});

notesApp.get('/classes', async (c) => {
  const anneeActive = await getAnneeActive();
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const classes = await prisma.classe.findMany({
    orderBy: { nom_classe: 'asc' }
  });
  return c.json(classes);
});

notesApp.get('/classes/:id_classe/matieres', async (c) => {
  const parsed = uuid.safeParse(c.req.param('id_classe'));
  if (!parsed.success) return c.json({ error: "Identifiant de classe invalide" }, 400);
  const id_classe = parsed.data;

  const anneeActive = await getAnneeActive();
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectations = await prisma.affectationCours.findMany({
    where: { id_classe, id_annee: anneeActive.id_annee },
    include: { matiere: true },
    orderBy: { matiere: { libelle_matiere: 'asc' } }
  });

  return c.json(affectations.map(a => a.matiere));
});

const filtresQuerySchema = z.object({
  id_classe: uuid,
  id_matiere: uuid
});

notesApp.get('/enseignants/filtres', async (c) => {
  const query = filtresQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Paramètres invalides" }, 400);
  const { id_classe, id_matiere } = query.data;

  const anneeActive = await getAnneeActive();
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectations = await prisma.affectationCours.findMany({
    where: { id_classe, id_matiere, id_annee: anneeActive.id_annee },
    include: { enseignant: true }
  });

  const enseignants = affectations
    .filter(a => a.enseignant.est_actif)
    .map(a => ({
      id_enseignant: a.enseignant.id_enseignant,
      nom_complet: a.enseignant.nom_complet
    }));

  return c.json(enseignants);
});

// -----------------------------------------------------------------------------
// 2. AUTHENTIFICATION DE L'ENSEIGNANT (Universel : Bcrypt ou Texte Clair)
// -----------------------------------------------------------------------------

const loginSchema = z.object({
  id_enseignant: uuid,
  mot_de_passe: z.string().min(1)
});

notesApp.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const validation = loginSchema.safeParse(body);
    if (!validation.success) return c.json({ error: "Données invalides" }, 400);

    const { id_enseignant, mot_de_passe } = validation.data;

    const enseignant = await prisma.enseignant.findUnique({
      where: { id_enseignant }
    });

    if (!enseignant || !enseignant.est_actif) {
      return c.json({ error: "Accès refusé ou enseignant inactif" }, 403);
    }

    let motDePasseValide = false;

    // Gestion universelle : hachage bcrypt ou texte clair
    if (enseignant.mot_de_passe.startsWith('$2a$') || enseignant.mot_de_passe.startsWith('$2b$')) {
      motDePasseValide = await bcrypt.compare(mot_de_passe, enseignant.mot_de_passe);
    } else {
      motDePasseValide = (mot_de_passe === enseignant.mot_de_passe);
    }

    if (!motDePasseValide) {
      return c.json({ error: "Mot de passe incorrect" }, 401);
    }

    const payload = {
      id_enseignant: enseignant.id_enseignant,
      nom_complet: enseignant.nom_complet,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4 // 4 heures
    };

    const token = await sign(payload, JWT_SECRET, 'HS256');
    return c.json({ token, message: "Connexion réussie" });
  } catch (error) {
    console.error("ERREUR LOGIN :", error);
    return c.json({
      error: "Erreur interne du serveur",
      details: process.env.NODE_ENV === 'production' ? undefined : String(error)
    }, 500);
  }
});

// -----------------------------------------------------------------------------
// 3. ESPACE DE SAISIE DES NOTES (Sécurisé par JWT)
// -----------------------------------------------------------------------------

notesApp.use('/notes/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: "Token manquant ou invalide" }, 401);
  }

  const firstAuth = authHeader.split(',')[0].trim();

  if (!firstAuth.startsWith('Bearer ')) {
    return c.json({ error: "Token manquant ou invalide" }, 401);
  }

  const token = firstAuth.slice(7).trim();

  if (!token) {
    return c.json({ error: "Token vide" }, 401);
  }

  let payload;

  try {
    payload = await verify(token, JWT_SECRET, 'HS256');
  } catch (error) {
    console.error("Erreur JWT :", error);

    return c.json({
      error: "Session expirée ou non autorisée",
      details: process.env.NODE_ENV === 'production' ? undefined : String(error)
    }, 401);
  }

  if (!uuid.safeParse(payload.id_enseignant).success) {
    return c.json({ error: "Token invalide" }, 401);
  }

  c.set('jwtPayload', payload as unknown as JwtPayload);

  await next();
});

const grilleQuerySchema = z.object({
  id_classe: uuid,
  id_matiere: uuid,
  id_sequence: uuid
});

notesApp.get('/notes/grille', async (c) => {
  const query = grilleQuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Paramètres invalides" }, 400);
  const { id_classe, id_matiere, id_sequence } = query.data;

  const { id_enseignant } = c.get('jwtPayload');

  const anneeActive = await getAnneeActive();
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectation = await affectationDeLEnseignant(
    id_enseignant, id_matiere, id_classe, anneeActive.id_annee
  );
  if (!affectation) {
    return c.json({ error: "Vous n'enseignez pas cette matière dans cette classe" }, 403);
  }

  const sequence = await sequenceDansAnnee(id_sequence, anneeActive.id_annee);
  if (!sequence) return c.json({ error: "Séquence introuvable pour l'année active" }, 400);

  const affectationsEleves = await prisma.affectationEleve.findMany({
    where: { id_classe, id_annee: anneeActive.id_annee },
    include: { eleve: true },
    orderBy: { eleve: { nom_complet: 'asc' } }
  });

  const eleves = affectationsEleves.map(ae => ae.eleve);

  const notesExistantes = await prisma.note.findMany({
    where: {
      id_affectation_cours: affectation.id_affectation_cours,
      id_sequence,
      id_eleve: { in: eleves.map(e => e.id_eleve) }
    }
  });

  const grille = eleves.map(eleve => {
    const noteTrouvee = notesExistantes.find(n => n.id_eleve === eleve.id_eleve);
    return {
      id_eleve: eleve.id_eleve,
      nom_complet: eleve.nom_complet,
      valeur_note: noteTrouvee ? Number(noteTrouvee.valeur_note) : null
    };
  });

  return c.json(grille);
});

const saveNotesSchema = z.object({
  id_classe: uuid,
  id_matiere: uuid,
  id_sequence: uuid,
  notes: z.array(z.object({
    id_eleve: uuid,
    valeur_note: z.number().min(0).max(20)
  })).min(1)
});

notesApp.post('/notes/sauvegarder', async (c) => {
  try {
    const body = await c.req.json();
    const validation = saveNotesSchema.safeParse(body);
    if (!validation.success) return c.json({ error: "Données de notes invalides", details: validation.error.format() }, 400);

    const { id_classe, id_matiere, id_sequence, notes } = validation.data;
    const { id_enseignant } = c.get('jwtPayload');

    const anneeActive = await getAnneeActive();
    if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

    const affectation = await affectationDeLEnseignant(
      id_enseignant, id_matiere, id_classe, anneeActive.id_annee
    );
    if (!affectation) {
      return c.json({ error: "Vous n'êtes pas autorisé à saisir les notes de cette matière dans cette classe" }, 403);
    }

    const sequence = await sequenceDansAnnee(id_sequence, anneeActive.id_annee);
    if (!sequence) return c.json({ error: "Séquence introuvable pour l'année active" }, 400);

    const idsEleves = Array.from(new Set(notes.map(n => n.id_eleve)));
    const elevesDeLaClasse = await prisma.affectationEleve.findMany({
      where: { id_classe, id_annee: anneeActive.id_annee, id_eleve: { in: idsEleves } },
      select: { id_eleve: true }
    });
    if (elevesDeLaClasse.length !== idsEleves.length) {
      const valides = new Set(elevesDeLaClasse.map(e => e.id_eleve));
      return c.json({
        error: "Certains élèves n'appartiennent pas à cette classe",
        eleves_invalides: idsEleves.filter(id => !valides.has(id))
      }, 400);
    }

    const { id_affectation_cours } = affectation;

    await prisma.$transaction(
      notes.map(item => {
        const valeur_note = Math.round(item.valeur_note * 100) / 100;

        return prisma.note.upsert({
          where: {
            id_eleve_id_affectation_cours_id_sequence: {
              id_eleve: item.id_eleve,
              id_affectation_cours,
              id_sequence
            }
          },
          update: { valeur_note },
          create: {
            id_eleve: item.id_eleve,
            id_affectation_cours,
            id_sequence,
            valeur_note
          }
        });
      })
    );

    return c.json({ success: true, message: "Notes enregistrées avec succès !" });
  } catch (error) {
    console.error("ERREUR SAUVEGARDE NOTES :", error);

    return c.json({
      error: "Erreur lors de l'enregistrement des notes",
      details: process.env.NODE_ENV === 'production'
        ? undefined
        : String(error)
    }, 500);
  }
});

export default notesApp;