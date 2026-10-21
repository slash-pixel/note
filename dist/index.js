import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { Scalar } from '@scalar/hono-api-reference';
const prisma = new PrismaClient();
const app = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || 'cle-secrete-super-securisee';
// -----------------------------------------------------------------------------
// 1. ENDPOINTS POUR LE FORMULAIRE DE CONNEXION (Listes dynamiques)
// -----------------------------------------------------------------------------
app.get('/api/trimestres', async (c) => {
    const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
    if (!anneeActive)
        return c.json({ error: "Aucune année active" }, 400);
    const trimestres = await prisma.trimestre.findMany({
        where: { id_annee: anneeActive.id_annee },
        include: { sequences: true }
    });
    return c.json(trimestres);
});
app.get('/api/classes', async (c) => {
    const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
    if (!anneeActive)
        return c.json({ error: "Aucune année active" }, 400);
    const classes = await prisma.classe.findMany({
        where: {
            eleves: { some: { id_annee: anneeActive.id_annee } }
        }
    });
    return c.json(classes);
});
app.get('/api/classes/:id_classe/matieres', async (c) => {
    const id_classe = Number(c.req.param('id_classe'));
    const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
    if (!anneeActive)
        return c.json({ error: "Aucune année active" }, 400);
    const affectations = await prisma.affectationCours.findMany({
        where: { id_classe, id_annee: anneeActive.id_annee },
        include: { matiere: true }
    });
    const matieres = Array.from(new Set(affectations.map(a => JSON.stringify(a.matiere)))).map(m => JSON.parse(m));
    return c.json(matieres);
});
app.get('/api/enseignants/filtres', async (c) => {
    const id_classe = Number(c.req.query('id_classe'));
    const id_matiere = Number(c.req.query('id_matiere'));
    const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
    if (!anneeActive)
        return c.json({ error: "Aucune année active" }, 400);
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
// 2. AUTHENTIFICATION SÉCURISÉE DE L'ENSEIGNANT
// -----------------------------------------------------------------------------
const loginSchema = z.object({
    id_enseignant: z.number(),
    mot_de_passe: z.string().min(1)
});
app.post('/api/auth/login', async (c) => {
    try {
        const body = await c.req.json();
        const validation = loginSchema.safeParse(body);
        if (!validation.success)
            return c.json({ error: "Données invalides" }, 400);
        const { id_enseignant, mot_de_passe } = validation.data;
        const enseignant = await prisma.enseignant.findUnique({
            where: { id_enseignant }
        });
        if (!enseignant || !enseignant.est_actif) {
            return c.json({ error: "Accès refusé ou enseignant inactif" }, 403);
        }
        const motDePasseValide = await bcrypt.compare(mot_de_passe, enseignant.mot_de_passe);
        if (!motDePasseValide) {
            return c.json({ error: "Mot de passe incorrect" }, 401);
        }
        const payload = {
            id_enseignant: enseignant.id_enseignant,
            nom_complet: enseignant.nom_complet,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4
        };
        // Génération du token avec les 3 arguments requis (payload, secret, algorithme)
        const token = await sign(payload, JWT_SECRET, 'HS256');
        return c.json({ token, message: "Connexion réussie" });
    }
    catch (error) {
        return c.json({ error: "Erreur interne du serveur" }, 500);
    }
});
// -----------------------------------------------------------------------------
// 3. ESPACE DE SAISIE DES NOTES (Sécurisé par JWT)
// -----------------------------------------------------------------------------
app.use('/api/notes/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: "Token manquant ou invalide" }, 401);
    }
    const token = authHeader.split(' ')[1];
    try {
        // Correction ici : on vérifie le token existant avec verify() au lieu de le signer à nouveau
        const payload = await verify(token, JWT_SECRET, 'HS256');
        c.set('jwtPayload', payload);
        await next();
    }
    catch (e) {
        return c.json({ error: "Session expirée ou non autorisée" }, 401);
    }
});
app.get('/api/notes/grille', async (c) => {
    const id_classe = Number(c.req.query('id_classe'));
    const id_matiere = Number(c.req.query('id_matiere'));
    const id_sequence = Number(c.req.query('id_sequence'));
    const anneeActive = await prisma.anneeScolaire.findFirst({ where: { est_active: true } });
    if (!anneeActive)
        return c.json({ error: "Aucune année active" }, 400);
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
app.post('/api/notes/sauvegarder', async (c) => {
    try {
        const body = await c.req.json();
        const validation = saveNotesSchema.safeParse(body);
        if (!validation.success)
            return c.json({ error: "Données de notes invalides", details: validation.error.format() }, 400);
        const { id_matiere, id_sequence, notes } = validation.data;
        await prisma.$transaction(notes.map(item => prisma.note.upsert({
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
        })));
        return c.json({ success: true, message: "Notes enregistrées avec succès !" });
    }
    catch (error) {
        return c.json({ error: "Erreur lors de l'enregistrement des notes" }, 500);
    }
});
// -----------------------------------------------------------------------------
// 4. DOCUMENTATION INTERACTIVE (Scalar / Swagger)
// -----------------------------------------------------------------------------
app.get('/reference', Scalar({
    url: '/doc',
    pageTitle: 'Documentation API Scolaire',
    theme: 'purple',
}));
app.get('/doc', (c) => {
    return c.json({
        openapi: '3.1.0',
        info: {
            title: 'API Gestion Scolaire - Notes & Séquences',
            version: '1.0.0',
        },
        paths: {},
    });
});
export default app;
