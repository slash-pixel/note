// src/routes/niveaux.ts
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { verify } from 'hono/jwt';
import { z } from 'zod';
const prisma = new PrismaClient();
const app = new Hono();
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères');
}
const uuid = z.string().uuid();
const error = (c, message, status = 400) => c.json({ error: message }, status);
// Vérification réservée aux administrateurs.
async function requireAdmin(c) {
    const header = c.req.header('Authorization') || '';
    if (!/^Bearer \S+$/.test(header)) {
        return error(c, 'Token manquant ou invalide', 401);
    }
    try {
        const payload = await verify(header.slice(7), secret, 'HS256');
        if (payload.role !== 'admin' ||
            typeof payload.sub !== 'string' ||
            !uuid.safeParse(payload.sub).success) {
            return error(c, 'Accès réservé aux administrateurs', 403);
        }
        const admin = await prisma.administrateur.findUnique({
            where: { id_admin: payload.sub },
            select: { est_actif: true }
        });
        if (!admin?.est_actif) {
            return error(c, 'Compte administrateur inactif', 403);
        }
        return null;
    }
    catch {
        return error(c, 'Session expirée ou invalide', 401);
    }
}
// --------------------------------------------------
// GET /niveaux
// Liste de tous les niveaux avec le nombre de matières.
// --------------------------------------------------
app.get('/niveaux', async (c) => {
    const niveaux = await prisma.niveau.findMany({
        orderBy: { libelle_niveau: 'asc' },
        include: {
            _count: {
                select: { matieres: true }
            }
        }
    });
    return c.json(niveaux.map(niveau => ({
        id_niveau: niveau.id_niveau,
        libelle_niveau: niveau.libelle_niveau,
        nombre_matieres: niveau._count.matieres
    })));
});
// --------------------------------------------------
// GET /niveaux/:id/programme
// Liste des matières du programme d'un niveau.
// --------------------------------------------------
app.get('/niveaux/:id/programme', async (c) => {
    const parsedId = uuid.safeParse(c.req.param('id'));
    if (!parsedId.success) {
        return error(c, 'Identifiant du niveau invalide');
    }
    const niveau = await prisma.niveau.findUnique({
        where: { id_niveau: parsedId.data },
        include: {
            matieres: {
                include: {
                    matiere: {
                        select: {
                            id_matiere: true,
                            libelle_matiere: true
                        }
                    }
                },
                orderBy: {
                    matiere: { libelle_matiere: 'asc' }
                }
            }
        }
    });
    if (!niveau) {
        return error(c, 'Niveau introuvable', 404);
    }
    return c.json({
        id_niveau: niveau.id_niveau,
        libelle_niveau: niveau.libelle_niveau,
        matieres: niveau.matieres.map(programme => programme.matiere)
    });
});
// --------------------------------------------------
// POST /niveaux/:id/programme
// Ajouter une matière au programme (admin uniquement).
// Corps : { "id_matiere": "UUID" }
// --------------------------------------------------
app.post('/niveaux/:id/programme', async (c) => {
    const auth = await requireAdmin(c);
    if (auth)
        return auth;
    const parsedId = uuid.safeParse(c.req.param('id'));
    if (!parsedId.success) {
        return error(c, 'Identifiant du niveau invalide');
    }
    const body = z.object({
        id_matiere: uuid
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
        return error(c, 'Données invalides : id_matiere est obligatoire');
    }
    const [niveau, matiere] = await Promise.all([
        prisma.niveau.findUnique({
            where: { id_niveau: parsedId.data },
            select: { id_niveau: true, libelle_niveau: true }
        }),
        prisma.matiere.findUnique({
            where: { id_matiere: body.data.id_matiere },
            select: { id_matiere: true, libelle_matiere: true }
        })
    ]);
    if (!niveau) {
        return error(c, 'Niveau introuvable', 404);
    }
    if (!matiere) {
        return error(c, 'Matière introuvable', 404);
    }
    try {
        const programme = await prisma.programmeNiveau.upsert({
            where: {
                id_niveau_id_matiere: {
                    id_niveau: parsedId.data,
                    id_matiere: body.data.id_matiere
                }
            },
            update: {},
            create: {
                id_niveau: parsedId.data,
                id_matiere: body.data.id_matiere
            },
            include: {
                matiere: {
                    select: {
                        id_matiere: true,
                        libelle_matiere: true
                    }
                }
            }
        });
        return c.json({
            success: true,
            message: 'Matière ajoutée au programme',
            matiere: programme.matiere
        });
    }
    catch (e) {
        console.error('Ajout matière au programme', e);
        return error(c, 'Impossible d’ajouter cette matière au programme');
    }
});
// --------------------------------------------------
// DELETE /niveaux/:id/programme/:idMatiere
// Retirer une matière du programme (admin uniquement).
// --------------------------------------------------
app.delete('/niveaux/:id/programme/:idMatiere', async (c) => {
    const auth = await requireAdmin(c);
    if (auth)
        return auth;
    const parsed = z.object({
        id_niveau: uuid,
        id_matiere: uuid
    }).safeParse({
        id_niveau: c.req.param('id'),
        id_matiere: c.req.param('idMatiere')
    });
    if (!parsed.success) {
        return error(c, 'Identifiants invalides');
    }
    try {
        const result = await prisma.programmeNiveau.deleteMany({
            where: {
                id_niveau: parsed.data.id_niveau,
                id_matiere: parsed.data.id_matiere
            }
        });
        if (result.count === 0) {
            return error(c, 'Cette matière ne figure pas dans le programme', 404);
        }
        return c.json({
            success: true,
            message: 'Matière retirée du programme'
        });
    }
    catch (e) {
        console.error('Suppression matière du programme', e);
        return error(c, 'Impossible de retirer cette matière');
    }
});
export default app;
