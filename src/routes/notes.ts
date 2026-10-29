import { Hono } from 'hono';
import { Prisma, PrismaClient } from '@prisma/client';
   import ExcelJS from 'exceljs';
   import { createHash, timingSafeEqual } from 'node:crypto';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import bcrypt from 'bcryptjs';






const prisma = new PrismaClient();
const app = new Hono<{ Variables: { actor: { id: string; role: 'enseignant' | 'admin' } } }>();
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET doit contenir au moins 32 caractères');
const uuid = z.string().uuid();
const authSchema = z.object({ id_enseignant: uuid.optional(), id_admin: uuid.optional(), mot_de_passe: z.string().min(1) });
const targetSchema = z.object({ id_classe: uuid, id_matiere: uuid, id_sequence: uuid });
const notesSchema = targetSchema.extend({
  notes: z.array(z.object({ id_eleve: uuid, valeur_note: z.number().finite().min(0).max(20) })).min(1)
}).superRefine((v, ctx) => {
  const ids = v.notes.map(n => n.id_eleve);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Élève présent plusieurs fois' });
});
const adminTargetSchema = z.object({ id_affectation_cours: uuid, id_sequence: uuid });
const decimal = (v: number | Prisma.Decimal) => new Prisma.Decimal(v.toString());
const num = (v: Prisma.Decimal) => Number(v);
const error = (c: any, message: string, status: 400 | 401 | 403 | 404 | 409 = 400) => c.json({ error: message }, status);
const activeYear = () => prisma.anneeScolaire.findFirst({ where: { est_active: true } });
const getAssignment = (id_matiere: string, id_classe: string, id_annee: string) =>
  prisma.affectationCours.findUnique({ where: { id_matiere_id_classe_id_annee: { id_matiere, id_classe, id_annee } }, include: { matiere: true, classe: true } });
const getSequence = (id_sequence: string, id_annee: string) =>
  prisma.sequence.findFirst({ where: { id_sequence, trimestre: { id_annee } }, include: { trimestre: { include: { sequences: { orderBy: { numero_sequence: 'asc' } } } } } });
const isOwner = (actor: { id: string; role: string }, assignment: { id_enseignant: string }) =>
  actor.role === 'admin' || actor.id === assignment.id_enseignant;

async function login(c: any, role: 'enseignant' | 'admin') {
  const body = authSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return error(c, 'Données de connexion invalides', 400);
  const id = role === 'admin' ? body.data.id_admin : body.data.id_enseignant;
  if (!id) return error(c, 'Identifiant manquant ou invalide', 400);
  const person = role === 'admin'
    ? await prisma.administrateur.findUnique({ where: { id_admin: id } })
    : await prisma.enseignant.findUnique({ where: { id_enseignant: id } });
  if (!person || !person.est_actif || !(await bcrypt.compare(body.data.mot_de_passe, person.mot_de_passe))) {
    return error(c, 'Identifiants incorrects ou compte inactif', 401);
  }
  const token = await sign({ sub: id, role, exp: Math.floor(Date.now() / 1000) + 4 * 3600 }, secret!, 'HS256');
  return c.json({ token, role, nom_complet: person.nom_complet, message: 'Connexion réussie' });
}
app.post('/auth/login', c => login(c, 'enseignant'));
app.post('/admin/auth/login', c => login(c, 'admin'));

app.get('/trimestres', async c => {
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  return c.json(await prisma.trimestre.findMany({ where: { id_annee: year.id_annee }, orderBy: { numero_trimestre: 'asc' }, include: { sequences: { orderBy: { numero_sequence: 'asc' } } } }));
});
app.get('/sequences', async c => {
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const trimestres = await prisma.trimestre.findMany({ where: { id_annee: year.id_annee }, orderBy: { numero_trimestre: 'asc' }, include: { sequences: { orderBy: { numero_sequence: 'asc' } } } });
  return c.json(trimestres.map(t => ({ id_trimestre: t.id_trimestre, numero_trimestre: t.numero_trimestre, libelle_trimestre: `Trimestre ${t.numero_trimestre}`, sequences: t.sequences.map(s => ({ id_sequence: s.id_sequence, numero_sequence: s.numero_sequence, libelle_sequence: `Séquence ${s.numero_sequence}` })) })));
});
app.get('/classes', async c => {
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  return c.json(await prisma.classe.findMany({ orderBy: { nom_classe: 'asc' } }));
});
app.get('/classes/:id_classe/matieres', async c => {
  const id = uuid.safeParse(c.req.param('id_classe'));
  if (!id.success) return error(c, 'Classe invalide');
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const rows = await prisma.affectationCours.findMany({ where: { id_classe: id.data, id_annee: year.id_annee }, include: { matiere: true }, orderBy: { matiere: { libelle_matiere: 'asc' } } });
  return c.json(rows.map(a => ({ ...a.matiere, id_affectation_cours: a.id_affectation_cours, coefficient: num(a.coefficient) })));
});
app.get('/enseignants/filtres', async c => {
  const q = z.object({ id_classe: uuid, id_matiere: uuid }).safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const a = await getAssignment(q.data.id_matiere, q.data.id_classe, year.id_annee);
  if (!a) return c.json([]);
  const e = await prisma.enseignant.findUnique({ where: { id_enseignant: a.id_enseignant }, select: { id_enseignant: true, nom_complet: true, est_actif: true } });
  return c.json(e?.est_actif ? [{ id_enseignant: e.id_enseignant, nom_complet: e.nom_complet }] : []);
});

app.use('/notes/*', async (c, next) => {
  const header = c.req.header('Authorization') || '';
  if (!/^Bearer \S+$/.test(header)) return error(c, 'Token manquant', 401);
  try {
    const p = await verify(header.slice(7), secret!, 'HS256');
    if ((p.role !== 'admin' && p.role !== 'enseignant') || typeof p.sub !== 'string' || !uuid.safeParse(p.sub).success) return error(c, 'Token invalide', 401);
    const person = p.role === 'admin'
      ? await prisma.administrateur.findUnique({ where: { id_admin: p.sub }, select: { est_actif: true } })
      : await prisma.enseignant.findUnique({ where: { id_enseignant: p.sub }, select: { est_actif: true } });
    if (!person?.est_actif) return error(c, 'Compte inactif', 403);
    c.set('actor', { id: p.sub, role: p.role as 'enseignant' | 'admin' });
    await next();
  } catch { return error(c, 'Session expirée ou invalide', 401); }
});

async function resolveTarget(c: any, input: z.infer<typeof targetSchema>) {
  const year = await activeYear();
  if (!year) return { failure: error(c, 'Aucune année active') };
  const a = await getAssignment(input.id_matiere, input.id_classe, year.id_annee);
  if (!a) return { failure: error(c, 'Cours introuvable', 404) };
  if (!isOwner(c.get('actor'), a)) return { failure: error(c, 'Accès refusé', 403) };
  const s = await getSequence(input.id_sequence, year.id_annee);
  if (!s) return { failure: error(c, 'Séquence introuvable', 404) };
  return { a, s, year };
}
async function refreshQuarter(tx: Prisma.TransactionClient, id_eleve: string, id_affectation_cours: string, sequence: NonNullable<Awaited<ReturnType<typeof getSequence>>>, coefficient: Prisma.Decimal) {
  const sequenceIds = sequence.trimestre.sequences.map(s => s.id_sequence);
  if (sequenceIds.length !== 2) {
    await tx.resultatTrimestriel.deleteMany({ where: { id_eleve, id_affectation_cours, id_trimestre: sequence.id_trimestre } });
    return;
  }
  const notes = await tx.note.findMany({ where: { id_eleve, id_affectation_cours, id_sequence: { in: sequenceIds } } });
  if (notes.length !== 2) {
    await tx.resultatTrimestriel.deleteMany({ where: { id_eleve, id_affectation_cours, id_trimestre: sequence.id_trimestre } });
    return;
  }
  const somme_notes = notes.reduce((sum, n) => sum.plus(n.valeur_note), decimal(0));
  const moyenne_trimestrielle = somme_notes.div(2).toDecimalPlaces(2);
  const moyenne_x_coefficient = moyenne_trimestrielle.mul(coefficient).toDecimalPlaces(2);
  await tx.resultatTrimestriel.upsert({
    where: { id_eleve_id_affectation_cours_id_trimestre: { id_eleve, id_affectation_cours, id_trimestre: sequence.id_trimestre } },
    update: { somme_notes, moyenne_trimestrielle, moyenne_x_coefficient },
    create: { id_eleve, id_affectation_cours, id_trimestre: sequence.id_trimestre, somme_notes, moyenne_trimestrielle, moyenne_x_coefficient }
  });
}
async function grid(c: any) {
  const q = targetSchema.safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const target = await resolveTarget(c, q.data);
  if ('failure' in target) return target.failure;
  const { a, s, year } = target;
  const [students, grades, lock] = await Promise.all([
    prisma.affectationEleve.findMany({ where: { id_classe: a.id_classe, id_annee: year.id_annee }, include: { eleve: true }, orderBy: { eleve: { nom_complet: 'asc' } } }),
    prisma.note.findMany({ where: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } }),
    prisma.verrouillageNote.findUnique({ where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } } })
  ]);
  const byId = new Map(grades.map(n => [n.id_eleve, n]));
  return c.json({
    id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence,
    coefficient: num(a.coefficient), est_verrouille: lock?.est_verrouille ?? false,
    date_verrouillage: lock?.date_verrouillage ?? null,
    mode: lock?.est_verrouille ? 'lecture_seule' : 'saisie',
    grille: students.map(({ eleve }) => {
      const n = byId.get(eleve.id_eleve);
      return { id_eleve: eleve.id_eleve, nom_complet: eleve.nom_complet, valeur_note: n ? num(n.valeur_note) : null, note_x_coefficient: n ? num(n.note_x_coefficient) : null };
    })
  });
}
app.get('/notes/grille', grid);
app.get('/notes/consultation', grid);

app.post('/notes/sauvegarder', async c => {
  const parsed = notesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Données invalides', details: parsed.error.flatten() }, 400);
  const target = await resolveTarget(c, parsed.data);
  if ('failure' in target) return target.failure;
  const { a, s, year } = target;
  const ids = parsed.data.notes.map(n => n.id_eleve);
  try {
    await prisma.$transaction(async tx => {
      // A transaction-level advisory lock serializes saves/finalization for the same course and sequence.
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), hashtext(${s.id_sequence}))`;
      const lock = await tx.verrouillageNote.findUnique({ where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } } });
      if (lock?.est_verrouille) throw new Error('LOCKED');
      const enrolled = await tx.affectationEleve.findMany({ where: { id_classe: a.id_classe, id_annee: year.id_annee, id_eleve: { in: ids } }, select: { id_eleve: true } });
      if (enrolled.length !== ids.length) throw new Error('INVALID_STUDENTS');
      for (const n of parsed.data.notes) {
        const valeur_note = decimal(n.valeur_note).toDecimalPlaces(2);
        const note_x_coefficient = valeur_note.mul(a.coefficient).toDecimalPlaces(2);
        await tx.note.upsert({
          where: { id_eleve_id_affectation_cours_id_sequence: { id_eleve: n.id_eleve, id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } },
          update: { valeur_note, note_x_coefficient },
          create: { id_eleve: n.id_eleve, id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence, valeur_note, note_x_coefficient }
        });
        await refreshQuarter(tx, n.id_eleve, a.id_affectation_cours, s, a.coefficient);
      }
    }, { timeout: 20000 });
    return c.json({ success: true, message: 'Brouillon enregistré', est_verrouille: false });
  } catch (e) {
    if (e instanceof Error && e.message === 'LOCKED') return error(c, 'Notes validées : modification interdite. Demandez une réouverture à l’administration.', 409);
    if (e instanceof Error && e.message === 'INVALID_STUDENTS') return error(c, 'Un ou plusieurs élèves ne sont pas inscrits dans cette classe');
    console.error('Sauvegarde des notes', e);
    return error(c, 'Échec de la sauvegarde', 400);
  }
});

app.post('/notes/valider', async c => {
  const parsed = targetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const target = await resolveTarget(c, parsed.data);
  if ('failure' in target) return target.failure;
  const { a, s, year } = target;
  try {
    const result = await prisma.$transaction(async tx => {
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), hashtext(${s.id_sequence}))`;
      const enrolled = await tx.affectationEleve.findMany({ where: { id_classe: a.id_classe, id_annee: year.id_annee }, select: { id_eleve: true } });
      if (!enrolled.length) throw new Error('EMPTY_CLASS');
      const grades = await tx.note.findMany({ where: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence, id_eleve: { in: enrolled.map(e => e.id_eleve) } }, select: { id_eleve: true } });
      if (grades.length !== enrolled.length) throw new Error('INCOMPLETE');
      const lock = await tx.verrouillageNote.findUnique({ where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } } });
      if (lock?.est_verrouille) throw new Error('LOCKED');
      return tx.verrouillageNote.upsert({
        where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } },
        update: { est_verrouille: true, date_verrouillage: new Date(), id_admin: c.get('actor').role === 'admin' ? c.get('actor').id : null },
        create: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence, est_verrouille: true, date_verrouillage: new Date(), id_admin: c.get('actor').role === 'admin' ? c.get('actor').id : null }
      });
    }, { timeout: 20000 });
    return c.json({ success: true, message: 'Notes validées et verrouillées', est_verrouille: result.est_verrouille, date_verrouillage: result.date_verrouillage });
  } catch (e) {
    if (e instanceof Error && e.message === 'INCOMPLETE') return error(c, 'Tous les élèves de la classe doivent avoir une note avant validation', 409);
    if (e instanceof Error && e.message === 'EMPTY_CLASS') return error(c, 'Impossible de valider une classe vide', 409);
    if (e instanceof Error && e.message === 'LOCKED') return error(c, 'Notes déjà verrouillées', 409);
    console.error('Validation', e);
    return error(c, 'Échec de validation');
  }
});

// Admin: reopen a finalized course/sequence, then the teacher can edit and finalize again.
app.post('/notes/admin/deverrouiller', async c => {
  if (c.get('actor').role !== 'admin') return error(c, 'Réservé à l’administration', 403);
  const parsed = adminTargetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const { id_affectation_cours, id_sequence } = parsed.data;
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const [a, s] = await Promise.all([
    prisma.affectationCours.findFirst({ where: { id_affectation_cours, id_annee: year.id_annee } }),
    getSequence(id_sequence, year.id_annee)
  ]);
  if (!a || !s) return error(c, 'Cours ou séquence introuvable', 404);
  const lock = await prisma.$transaction(async tx => {
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id_affectation_cours}), hashtext(${id_sequence}))`;
    return tx.verrouillageNote.upsert({
      where: { id_affectation_cours_id_sequence: { id_affectation_cours, id_sequence } },
      update: { est_verrouille: false, date_verrouillage: null, id_admin: c.get('actor').id },
      create: { id_affectation_cours, id_sequence, est_verrouille: false, id_admin: c.get('actor').id }
    });
  });
  return c.json({ success: true, message: 'Saisie rouverte', est_verrouille: lock.est_verrouille });
});

app.get('/notes/admin/verrouillages', async c => {
  if (c.get('actor').role !== 'admin') return error(c, 'Réservé à l’administration', 403);
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const rows = await prisma.verrouillageNote.findMany({
    where: { affectationCours: { id_annee: year.id_annee } },
    include: { affectationCours: { include: { classe: true, matiere: true, enseignant: { select: { id_enseignant: true, nom_complet: true } } } }, sequence: true, administrateur: { select: { id_admin: true, nom_complet: true } } },
    orderBy: { date_verrouillage: 'desc' }
  });
  return c.json(rows);
});

app.get('/notes/resultats-trimestriels', async c => {
  const q = z.object({ id_classe: uuid, id_matiere: uuid, id_trimestre: uuid }).safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  const a = await getAssignment(q.data.id_matiere, q.data.id_classe, year.id_annee);
  if (!a) return error(c, 'Cours introuvable', 404);
  if (!isOwner(c.get('actor'), a)) return error(c, 'Accès refusé', 403);
  const t = await prisma.trimestre.findFirst({ where: { id_trimestre: q.data.id_trimestre, id_annee: year.id_annee } });
  if (!t) return error(c, 'Trimestre introuvable', 404);
  const students = await prisma.affectationEleve.findMany({ where: { id_classe: a.id_classe, id_annee: year.id_annee }, include: { eleve: true }, orderBy: { eleve: { nom_complet: 'asc' } } });
  const results = await prisma.resultatTrimestriel.findMany({ where: { id_affectation_cours: a.id_affectation_cours, id_trimestre: t.id_trimestre } });
  const map = new Map(results.map(r => [r.id_eleve, r]));
  return c.json({ coefficient: num(a.coefficient), resultats: students.map(({ eleve }) => {
    const r = map.get(eleve.id_eleve);
    return { id_eleve: eleve.id_eleve, nom_complet: eleve.nom_complet, somme_notes: r ? num(r.somme_notes) : null, moyenne_trimestrielle: r ? num(r.moyenne_trimestrielle) : null, moyenne_x_coefficient: r ? num(r.moyenne_x_coefficient) : null };
  }) });
});


// ============================================================================
// À COLLER dans src/routes/notes.ts, juste AVANT la ligne « export default app; »
//
// 1) En haut de notes.ts, ajouter les imports :
//      import ExcelJS from 'exceljs';
//      import { createHash, timingSafeEqual } from 'node:crypto';
// 2) Installer la dépendance :
//      npm install exceljs
// 3) Sur Render (Environment), créer la variable :
//      DASHBOARD_PASSWORD = le mot de passe de votre choix (8 caractères minimum)
// ============================================================================

// ---------------------------------------------------------------------------
// Accès au dashboard : un simple mot de passe partagé (DASHBOARD_PASSWORD)
// ---------------------------------------------------------------------------
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const safeEqual = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Limite les essais : 8 erreurs par 15 minutes et par adresse IP
const attempts = new Map<string, { count: number; resetAt: number }>();
const clientIp = (c: any) => String(c.req.header('x-forwarded-for') || 'local').split(',')[0].trim();

app.post('/dashboard/login', async c => {
  if (!dashboardPassword || dashboardPassword.length < 8) {
    return c.json({ error: 'Accès au tableau de bord non configuré sur le serveur' }, 503);
  }
  const ip = clientIp(c);
  const now = Date.now();
  const entry = attempts.get(ip);
  const active = entry && entry.resetAt > now ? entry : null;
  if (active && active.count >= 8) {
    return c.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429);
  }

  const body = z.object({ mot_de_passe: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return error(c, 'Mot de passe requis');

  if (!safeEqual(body.data.mot_de_passe, dashboardPassword)) {
    attempts.set(ip, active ? { ...active, count: active.count + 1 } : { count: 1, resetAt: now + 15 * 60 * 1000 });
    return error(c, 'Mot de passe incorrect', 401);
  }
  attempts.delete(ip);
  const token = await sign({ role: 'dashboard', exp: Math.floor(now / 1000) + 4 * 3600 }, secret!, 'HS256');
  return c.json({ token });
});

// Toutes les autres routes /dashboard/* exigent ce jeton (enseignants exclus)
app.use('/dashboard/*', async (c, next) => {
  const header = c.req.header('Authorization') || '';
  if (!/^Bearer \S+$/.test(header)) return error(c, 'Token manquant', 401);
  try {
    const p = await verify(header.slice(7), secret!, 'HS256');
    if (p.role !== 'dashboard') return error(c, 'Token invalide', 401);
  } catch {
    return error(c, 'Session expirée ou invalide', 401);
  }
  await next();
});

// ---------------------------------------------------------------------------
// NOMENCLATURE DES FICHIERS (le seul endroit à modifier pour changer le nom)
// Exemple : NOTES_2026-2027_6EME-M-1_MATHEMATIQUES_T1-S1_VALIDE.xlsx
// ---------------------------------------------------------------------------
const slug = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

const buildFileName = (p: {
  annee: string;
  classe: string;
  matiere: string;
  trimestre: number;
  sequence: number;
  verrouille: boolean;
}) =>
  `NOTES_${slug(p.annee)}_${slug(p.classe)}_${slug(p.matiere)}_T${p.trimestre}-S${p.sequence}_${p.verrouille ? 'VALIDE' : 'BROUILLON'}.xlsx`;

// ---------------------------------------------------------------------------
// Dashboard : tous les fichiers de notes enregistrés (brouillon) ou verrouillés
// ---------------------------------------------------------------------------
app.get('/dashboard/liste', async c => {
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');

  const sequences = await prisma.sequence.findMany({
    where: { trimestre: { id_annee: year.id_annee } },
    include: { trimestre: true }
  });
  const seqById = new Map(sequences.map(s => [s.id_sequence, s]));
  const seqIds = sequences.map(s => s.id_sequence);

  const [noteGroups, locks, effectifs] = await Promise.all([
    prisma.note.groupBy({
      by: ['id_affectation_cours', 'id_sequence'],
      where: { id_sequence: { in: seqIds } },
      _count: { _all: true }
    }),
    prisma.verrouillageNote.findMany({ where: { id_sequence: { in: seqIds } } }),
    prisma.affectationEleve.groupBy({
      by: ['id_classe'],
      where: { id_annee: year.id_annee },
      _count: { _all: true }
    })
  ]);

  const key = (cours: string, seq: string) => `${cours}|${seq}`;
  const counts = new Map(noteGroups.map(g => [key(g.id_affectation_cours, g.id_sequence), g._count._all]));
  const lockMap = new Map(locks.filter(l => l.est_verrouille).map(l => [key(l.id_affectation_cours, l.id_sequence), l]));
  const keys = new Set<string>([...counts.keys(), ...lockMap.keys()]);
  const courseIds = [...new Set([...keys].map(k => k.split('|')[0]))];

  const courses = await prisma.affectationCours.findMany({
    where: { id_affectation_cours: { in: courseIds }, id_annee: year.id_annee },
    include: { classe: true, matiere: true, enseignant: { select: { nom_complet: true } } }
  });
  const courseById = new Map(courses.map(a => [a.id_affectation_cours, a]));
  const effectifByClass = new Map(effectifs.map(e => [e.id_classe, e._count._all]));

  const rows = [...keys].flatMap(k => {
    const [idCours, idSeq] = k.split('|');
    const a = courseById.get(idCours);
    const s = seqById.get(idSeq);
    if (!a || !s) return [];
    const lock = lockMap.get(k);
    const verrouille = Boolean(lock);
    return [{
      id_affectation_cours: a.id_affectation_cours,
      id_sequence: s.id_sequence,
      classe: a.classe.nom_classe,
      matiere: a.matiere.libelle_matiere,
      enseignant: a.enseignant.nom_complet,
      coefficient: num(a.coefficient),
      trimestre: s.trimestre.numero_trimestre,
      sequence: s.numero_sequence,
      effectif: effectifByClass.get(a.id_classe) ?? 0,
      notes_saisies: counts.get(k) ?? 0,
      statut: verrouille ? 'verrouille' as const : 'brouillon' as const,
      date_verrouillage: lock?.date_verrouillage ?? null,
      nom_fichier: buildFileName({
        annee: year.libelle_annee,
        classe: a.classe.nom_classe,
        matiere: a.matiere.libelle_matiere,
        trimestre: s.trimestre.numero_trimestre,
        sequence: s.numero_sequence,
        verrouille
      })
    }];
  });

  rows.sort((x, y) =>
    x.classe.localeCompare(y.classe, 'fr') ||
    x.matiere.localeCompare(y.matiere, 'fr') ||
    x.trimestre - y.trimestre ||
    x.sequence - y.sequence
  );

  return c.json({ annee: year.libelle_annee, rows });
});

// ---------------------------------------------------------------------------
// Export Excel d'un fichier de notes (un cours + une séquence)
// ---------------------------------------------------------------------------
app.get('/dashboard/export', async c => {
  const q = adminTargetSchema.safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');

  const [a, s] = await Promise.all([
    prisma.affectationCours.findFirst({
      where: { id_affectation_cours: q.data.id_affectation_cours, id_annee: year.id_annee },
      include: { classe: true, matiere: true, enseignant: { select: { nom_complet: true } } }
    }),
    getSequence(q.data.id_sequence, year.id_annee)
  ]);
  if (!a || !s) return error(c, 'Cours ou séquence introuvable', 404);

  const [students, grades, lock] = await Promise.all([
    prisma.affectationEleve.findMany({
      where: { id_classe: a.id_classe, id_annee: year.id_annee },
      include: { eleve: true },
      orderBy: { eleve: { nom_complet: 'asc' } }
    }),
    prisma.note.findMany({ where: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } }),
    prisma.verrouillageNote.findUnique({
      where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: s.id_sequence } }
    })
  ]);

  const verrouille = lock?.est_verrouille ?? false;
  const byId = new Map(grades.map(n => [n.id_eleve, n]));
  const coefficient = num(a.coefficient);

  const NAVY = 'FF0B1F4B';
  const GOLD = 'FFC9A227';
  const thin = { style: 'thin' as const, color: { argb: 'FFB8C2D6' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Collège Catholique Saint Charles Borromée';
  wb.created = new Date();
  const ws = wb.addWorksheet('Notes');
  ws.columns = [{ width: 8 }, { width: 46 }, { width: 14 }, { width: 20 }];
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'COLLÈGE CATHOLIQUE SAINT CHARLES BORROMÉE';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = `Relevé de notes, trimestre ${s.trimestre.numero_trimestre}, séquence ${s.numero_sequence}`;
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: GOLD } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  const dateVerrou = lock?.date_verrouillage ? lock.date_verrouillage.toLocaleDateString('fr-FR') : null;
  const info: [string, string][] = [
    ['Année scolaire', year.libelle_annee],
    ['Classe', a.classe.nom_classe],
    ['Matière', a.matiere.libelle_matiere],
    ['Enseignant', a.enseignant.nom_complet],
    ['Coefficient', String(coefficient)],
    ['Statut', verrouille ? `Validé et verrouillé${dateVerrou ? ` le ${dateVerrou}` : ''}` : 'Brouillon (non validé)']
  ];
  info.forEach(([label, value], i) => {
    const r = 4 + i;
    ws.mergeCells(`A${r}:D${r}`);
    ws.getCell(`A${r}`).value = { richText: [{ text: `${label} : `, font: { bold: true } }, { text: value }] };
  });

  const HEADER_ROW = 11;
  const header = ws.getRow(HEADER_ROW);
  header.values = ['N°', 'Nom et prénom(s) de l’élève', 'Note / 20', 'NxC (note × coefficient)'];
  header.height = 22;
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];

  let sum = 0;
  let count = 0;
  students.forEach(({ eleve }, i) => {
    const n = byId.get(eleve.id_eleve);
    const note = n ? num(n.valeur_note) : null;
    const nxc = n ? num(n.note_x_coefficient) : null;
    if (note !== null) { sum += note; count += 1; }
    const row = ws.addRow([i + 1, eleve.nom_complet, note, nxc]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = '0.00';
    row.getCell(4).numFmt = '0.00';
    row.eachCell({ includeEmpty: true }, cell => { cell.border = border; });
  });

  ws.addRow([]);
  [
    `Effectif : ${students.length}`,
    `Notes saisies : ${count} / ${students.length}`,
    `Moyenne de la classe : ${count ? (sum / count).toFixed(2) : '—'} / 20`,
    `Exporté le ${new Date().toLocaleString('fr-FR')}`
  ].forEach(text => {
    const r = ws.addRow([text]);
    ws.mergeCells(`A${r.number}:D${r.number}`);
    r.font = { bold: true };
  });

  const fileName = buildFileName({
    annee: year.libelle_annee,
    classe: a.classe.nom_classe,
    matiere: a.matiere.libelle_matiere,
    trimestre: s.trimestre.numero_trimestre,
    sequence: s.numero_sequence,
    verrouille
  });

  const buffer = await wb.xlsx.writeBuffer();
  return c.body(new Uint8Array(buffer as ArrayBuffer), 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`
  });
});


export default app;
