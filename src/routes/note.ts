// src/routes/notes.ts
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

const prisma = new PrismaClient();
const notesApp = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || 'cle-secrete-super-securisee';

// -----------------------------------------------------------------------------
// 1. ENDPOINTS POUR LE FORMULAIRE DE CONNEXION (Listes dynamiques)
// -----------------------------------------------------------------------------

notesApp.get('/trimestres', async (c) => {
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const trimestres = await prisma.trimestre.findMany({
    where: { id_annee: anneeActive.id_annee },
    include: { sequences: true }
  });
  return c.json(trimestres);
});

notesApp.get('/classes', async (c) => {
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  // Récupération de toutes les classes sans exclure celles sans élèves affectés
  const classes = await prisma.classe.findMany({
    orderBy: {
      id_classe: 'asc'
    }
  });
  return c.json(classes);
});

notesApp.get('/classes/:id_classe/matieres', async (c) => {
  const id_classe = Number(c.req.param('id_classe'));
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectations = await prisma.affectationCours.findMany({
    where: { id_classe, id_annee: anneeActive.id_annee },
    include: { matiere: true }
  });

  const matieres = Array.from(new Set(affectations.map(a => JSON.stringify(a.matiere)))).map(m => JSON.parse(m));
  return c.json(matieres);
});

notesApp.get('/enseignants/filtres', async (c) => {
  const id_classe = Number(c.req.query('id_classe'));
  const id_matiere = Number(c.req.query('id_matiere'));
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectations = await prisma.affectationCours.findMany({
    where: { id_classe, id_matiere, id_annee: anneeActive.id_annee },
    include: { enseignant: true }
  });

  const enseignants = affectations.map(a => ({
    id_enseignant: a.enseignant.id_enseignant,
    nom_complet: a.enseignant.nom_complet
  }));

  return c.json(enseignants);
});

// -----------------------------------------------------------------------------
// 2. AUTHENTIFICATION DE L'ENSEIGNANT (Texte clair)
// -----------------------------------------------------------------------------

const loginSchema = z.object({
  id_enseignant: z.number(),
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

    const motDePasseValide = (mot_de_passe === enseignant.mot_de_passe);
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
    return c.json({ error: "Erreur interne du serveur", details: String(error) }, 500);
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

  // Nettoie l'en-tête au cas où Scalar concaténerait des chaînes (ex: "Bearer token, Bearer")
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
      details: String(error)
    }, 401);
  }

  c.set('jwtPayload', payload);

  // Exécuté en dehors du try/catch JWT pour ne pas masquer les erreurs métier/Prisma
  await next();
});

notesApp.get('/notes/grille', async (c) => {
  const id_classe = Number(c.req.query('id_classe'));
  const id_matiere = Number(c.req.query('id_matiere'));
  const id_sequence = Number(c.req.query('id_sequence'));

  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
  if (!anneeActive) return c.json({ error: "Aucune année active" }, 400);

  const affectationsEleves = await prisma.affectationEleve.findMany({
    where: { id_classe, id_annee: anneeActive.id_annee },
    include: { eleve: true }
  });

  const eleves = affectationsEleves.map(ae => ae.eleve);

  const notesExistantes = await prisma.note.findMany({
    where: {
      id_matiere,
      id_sequence,
      id_eleve: { in: eleves.map(e => e.id_eleve) }
    }
  });

  const grille = eleves.map(eleve => {
    const noteTrouvee = notesExistantes.find(n => n.id_eleve === eleve.id_eleve);
    return {
      id_eleve: eleve.id_eleve,
      nom_complet: eleve.nom_complet,
      valeur_note: noteTrouvee ? noteTrouvee.valeur_note : null
    };
  });

  return c.json(grille);
});

const saveNotesSchema = z.object({
  id_matiere: z.number(),
  id_sequence: z.number(),
  notes: z.array(z.object({
    id_eleve: z.number(),
    valeur_note: z.number().min(0).max(20)
  }))
});

notesApp.post('/notes/sauvegarder', async (c) => {
  try {
    const body = await c.req.json();
    const validation = saveNotesSchema.safeParse(body);
    if (!validation.success) return c.json({ error: "Données de notes invalides", details: validation.error.format() }, 400);

    const { id_matiere, id_sequence, notes } = validation.data;

    await prisma.$transaction(
      notes.map(item =>
        prisma.note.upsert({
          where: {
            id_eleve_id_matiere_id_sequence: {
              id_eleve: item.id_eleve,
              id_matiere,
              id_sequence
            }
          },
          update: { valeur_note: item.valeur_note },
          create: {
            id_eleve: item.id_eleve,
            id_matiere,
            id_sequence,
            valeur_note: item.valeur_note
          }
        })
      )
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