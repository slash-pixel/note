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
  coefficient: z.number().finite().min(0.01).max(99.99),
  notes: z.array(z.object({
    id_eleve: uuid,
    valeur_note: z.number().finite().min(0).max(20)
  })).min(1)
}).superRefine((v, ctx) => {
  const ids = v.notes.map(n => n.id_eleve);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Élève présent plusieurs fois' });
  }
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
  return c.json(trimestres.map(t => ({
    id_trimestre: t.id_trimestre,
    numero_trimestre: t.numero_trimestre,
    libelle_trimestre: `Trimestre ${t.numero_trimestre}`,
    sequences: t.sequences.map((s, index) => ({
      id_sequence: s.id_sequence,
      numero_sequence: s.numero_sequence,
      type_sequence: index === 0 ? 'cc' : 'eva',
      poids: index === 0 ? 30 : 70,
      libelle_sequence: index === 0 ? `CC${t.numero_trimestre}` : `Éva de niveau ${t.numero_trimestre}`
    }))
  })));
});
app.get('/classes', async c => {
  const year = await activeYear();
  if (!year) return error(c, 'Aucune année active');
  return c.json(await prisma.classe.findMany({ orderBy: { nom_classe: 'asc' } }));
});

app.get('/matieres', async c => {
  return c.json(await prisma.matiere.findMany({
    select: { id_matiere: true, libelle_matiere: true },
    orderBy: { libelle_matiere: 'asc' }
  }));
});

// Liste des enseignants actifs pour le formulaire de connexion.
app.get('/enseignants', async c => {
  const enseignants = await prisma.enseignant.findMany({
    where: { est_actif: true },
    select: { id_enseignant: true, nom_complet: true },
    orderBy: { nom_complet: 'asc' }
  });
  return c.json(enseignants);
});

// Matières explicitement autorisées pour un enseignant.
app.get('/enseignants/:id_enseignant/matieres', async c => {
  const id = uuid.safeParse(c.req.param('id_enseignant'));
  if (!id.success) return error(c, 'Enseignant invalide');

  const enseignant = await prisma.enseignant.findFirst({
    where: { id_enseignant: id.data, est_actif: true },
    select: { id_enseignant: true }
  });
  if (!enseignant) return error(c, 'Enseignant introuvable ou inactif', 404);

  const autorisations = await prisma.autorisationMatiere.findMany({
    where: { id_enseignant: id.data },
    include: { matiere: true },
    orderBy: { matiere: { libelle_matiere: 'asc' } }
  });
  return c.json(autorisations.map(a => a.matiere));
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
  const q = z.object({ id_classe: uuid.optional(), id_matiere: uuid }).safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const rows = await prisma.autorisationMatiere.findMany({
    where: { id_matiere: q.data.id_matiere, enseignant: { est_actif: true } },
    include: { enseignant: { select: { id_enseignant: true, nom_complet: true } } },
    orderBy: { enseignant: { nom_complet: 'asc' } }
  });
  return c.json(rows.map(r => r.enseignant));
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

// Récupère le cours existant ou le crée pour l'enseignant connecté.
// La création n'est possible que si la matière figure dans ses autorisations.
async function resolveAuthorizedAssignment(c: any, id_matiere: string, id_classe: string, id_annee: string) {
  const actor = c.get('actor') as { id: string; role: 'enseignant' | 'admin' };
  let a = await getAssignment(id_matiere, id_classe, id_annee);

  // L'administration conserve le fonctionnement historique : elle consulte
  // les cours déjà créés et ne crée pas de cours au nom d'un enseignant.
  if (actor.role === 'admin') {
    if (!a) return { failure: error(c, 'Cours introuvable', 404) };
    return { a };
  }

  const autorisation = await prisma.autorisationMatiere.findUnique({
    where: { id_enseignant_id_matiere: { id_enseignant: actor.id, id_matiere } }
  });
  if (!autorisation) return { failure: error(c, 'Vous n’êtes pas autorisé à saisir les notes de cette matière.', 403) };

  if (a) {
    if (a.id_enseignant !== actor.id) {
      return { failure: error(c, 'Ce cours est déjà attribué à un autre enseignant.', 403) };
    }
    return { a };
  }

  try {
    a = await prisma.affectationCours.create({
      data: {
        id_enseignant: actor.id,
        id_matiere,
        id_classe,
        id_annee,
        coefficient: new Prisma.Decimal(1)
      },
      include: { matiere: true, classe: true }
    });
    return { a };
  } catch (e) {
    // En cas de création simultanée, relire le cours créé par l'autre requête.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const concurrent = await getAssignment(id_matiere, id_classe, id_annee);
      if (concurrent?.id_enseignant === actor.id) return { a: concurrent };
      if (concurrent) return { failure: error(c, 'Ce cours est déjà attribué à un autre enseignant.', 403) };
    }
    console.error('Création affectation cours', e);
    return { failure: error(c, 'Impossible de préparer ce cours pour la saisie.', 400) };
  }
}

async function resolveTarget(c: any, input: z.infer<typeof targetSchema>) {
  const year = await activeYear();
  if (!year) return { failure: error(c, 'Aucune année active') };
  const assignment = await resolveAuthorizedAssignment(c, input.id_matiere, input.id_classe, year.id_annee);
  if (assignment.failure) {
  return { failure: assignment.failure };
}
  const a = assignment.a;
  const s = await getSequence(input.id_sequence, year.id_annee);
  if (!s) return { failure: error(c, 'Séquence introuvable', 404) };
  return { a, s, year };
}
const POIDS_CC = new Prisma.Decimal('0.3');
const POIDS_EVA = new Prisma.Decimal('0.7');
type TrimestreAvecSequences = NonNullable<Awaited<ReturnType<typeof getSequence>>>['trimestre'];

// 1re séquence du trimestre = CC, 2e = Éva de niveau
const rolesTrimestre = (t: TrimestreAvecSequences) => ({ cc: t.sequences[0] ?? null, eva: t.sequences[1] ?? null });
const libelleCC = (numeroTrimestre: number) => `CC${numeroTrimestre}`;
const libelleEva = (numeroTrimestre: number) => `Éva de niveau ${numeroTrimestre}`;

function calculerTrimestre(
  cc: Prisma.Decimal | null | undefined,
  eva: Prisma.Decimal | null | undefined,
  coefficient: Prisma.Decimal
) {
  if (cc == null || eva == null) return null;
  const moyenne = cc.mul(POIDS_CC).plus(eva.mul(POIDS_EVA)).toDecimalPlaces(2); // 30 % CC + 70 % Éva
  return {
    somme: cc.plus(eva),
    moyenne,
    moyenneXCoef: moyenne.mul(coefficient).toDecimalPlaces(2) // NxC du trimestre
  };
}

// Recalcule le résultat d'un élève pour un trimestre. Ne supprime JAMAIS rien :
// tant que CC et Éva ne sont pas tous les deux saisis, il n'y a simplement pas de résultat.
async function refreshTrimestre(
  tx: Prisma.TransactionClient,
  id_eleve: string,
  id_affectation_cours: string,
  trimestre: TrimestreAvecSequences,
  coefficient: Prisma.Decimal
) {
  const { cc, eva } = rolesTrimestre(trimestre);
  if (!cc || !eva) return;
  const notes = await tx.note.findMany({
    where: { id_eleve, id_affectation_cours, id_sequence: { in: [cc.id_sequence, eva.id_sequence] } }
  });
  const r = calculerTrimestre(
    notes.find(n => n.id_sequence === cc.id_sequence)?.valeur_note,
    notes.find(n => n.id_sequence === eva.id_sequence)?.valeur_note,
    coefficient
  );
  if (!r) return;
  await tx.resultatTrimestriel.upsert({
    where: { id_eleve_id_affectation_cours_id_trimestre: { id_eleve, id_affectation_cours, id_trimestre: trimestre.id_trimestre } },
    update: { somme_notes: r.somme, moyenne_trimestrielle: r.moyenne, moyenne_x_coefficient: r.moyenneXCoef },
    create: { id_eleve, id_affectation_cours, id_trimestre: trimestre.id_trimestre, somme_notes: r.somme, moyenne_trimestrielle: r.moyenne, moyenne_x_coefficient: r.moyenneXCoef }
  });
}

// Wrapper : garde la compatibilité avec les anciennes routes
async function refreshQuarter(
  tx: Prisma.TransactionClient,
  id_eleve: string,
  id_affectation_cours: string,
  sequence: NonNullable<Awaited<ReturnType<typeof getSequence>>>,
  coefficient: Prisma.Decimal
) {
  await refreshTrimestre(tx, id_eleve, id_affectation_cours, sequence.trimestre, coefficient);
}
async function grid(c: any) {
  const q = targetSchema.safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const target = await resolveTarget(c, q.data);
  if (target.failure) return target.failure;
  const { a, s, year } = target;
  if (!a || !s || !year) {
  return error(c, 'Cours, séquence ou année scolaire introuvable.', 404);
}
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
  if (!parsed.success) {
    return c.json({ error: 'Données invalides', details: parsed.error.flatten() }, 400);
  }

  const target = await resolveTarget(c, parsed.data);
  if (target.failure) return target.failure;

  const { a, s, year } = target;
  if (!a || !s || !year) {
  return error(c, 'Cours, séquence ou année scolaire introuvable.', 404);
}
  const ids = parsed.data.notes.map(n => n.id_eleve);
  const nouveauCoefficient = decimal(parsed.data.coefficient).toDecimalPlaces(2);

  try {
    await prisma.$transaction(async tx => {
      // Verrou commun au cours entier : empêche une modification du coefficient
      // en parallèle d'une sauvegarde ou d'une validation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), 0)`;

      const lock = await tx.verrouillageNote.findUnique({
        where: {
          id_affectation_cours_id_sequence: {
            id_affectation_cours: a.id_affectation_cours,
            id_sequence: s.id_sequence
          }
        }
      });
      if (lock?.est_verrouille) throw new Error('LOCKED');

      const enrolled = await tx.affectationEleve.findMany({
        where: {
          id_classe: a.id_classe,
          id_annee: year.id_annee,
          id_eleve: { in: ids }
        },
        select: { id_eleve: true }
      });
      if (enrolled.length !== ids.length) throw new Error('INVALID_STUDENTS');

      const cours = await tx.affectationCours.findUniqueOrThrow({
        where: { id_affectation_cours: a.id_affectation_cours },
        select: { coefficient: true }
      });
      const coefficientChange = cours.coefficient.toString() !== nouveauCoefficient.toString();

      if (coefficientChange) {
        // Le coefficient étant commun à toutes les séquences de ce cours,
        // on refuse de le changer si au moins une séquence est verrouillée.
        const verrouExistant = await tx.verrouillageNote.findFirst({
          where: {
            id_affectation_cours: a.id_affectation_cours,
            est_verrouille: true
          },
          select: { id_sequence: true }
        });
        if (verrouExistant) throw new Error('COEFFICIENT_LOCKED');

        await tx.affectationCours.update({
          where: { id_affectation_cours: a.id_affectation_cours },
          data: { coefficient: nouveauCoefficient }
        });

        // Recalculer le NxC de toutes les notes existantes de ce cours.
        const anciennesNotes = await tx.note.findMany({
          where: { id_affectation_cours: a.id_affectation_cours },
          select: { id_eleve: true, id_sequence: true, valeur_note: true }
        });

        for (const note of anciennesNotes) {
          await tx.note.update({
            where: {
              id_eleve_id_affectation_cours_id_sequence: {
                id_eleve: note.id_eleve,
                id_affectation_cours: a.id_affectation_cours,
                id_sequence: note.id_sequence
              }
            },
            data: {
              note_x_coefficient: note.valeur_note.mul(nouveauCoefficient).toDecimalPlaces(2)
            }
          });
        }
      }

      // Sauvegarder les notes reçues avec le coefficient choisi.
      for (const n of parsed.data.notes) {
        const valeur_note = decimal(n.valeur_note).toDecimalPlaces(2);
        const note_x_coefficient = valeur_note.mul(nouveauCoefficient).toDecimalPlaces(2);

        await tx.note.upsert({
          where: {
            id_eleve_id_affectation_cours_id_sequence: {
              id_eleve: n.id_eleve,
              id_affectation_cours: a.id_affectation_cours,
              id_sequence: s.id_sequence
            }
          },
          update: { valeur_note, note_x_coefficient },
          create: {
            id_eleve: n.id_eleve,
            id_affectation_cours: a.id_affectation_cours,
            id_sequence: s.id_sequence,
            valeur_note,
            note_x_coefficient
          }
        });
      }

      // Recalculer les résultats trimestriels de tous les élèves ayant des notes
      // dans ce cours, car le coefficient peut avoir changé pour les anciennes séquences.
      const notesDuCours = await tx.note.findMany({
        where: { id_affectation_cours: a.id_affectation_cours },
        select: { id_eleve: true, id_sequence: true }
      });
      const sequenceIds = [...new Set(notesDuCours.map(n => n.id_sequence))];
      const sequences = await tx.sequence.findMany({
        where: { id_sequence: { in: sequenceIds } },
        include: {
          trimestre: {
            include: {
              sequences: { orderBy: { numero_sequence: 'asc' } }
            }
          }
        }
      });
      const sequenceById = new Map(sequences.map(sequence => [sequence.id_sequence, sequence]));
      const dejaActualises = new Set<string>();

      for (const note of notesDuCours) {
        const sequence = sequenceById.get(note.id_sequence);
        if (!sequence) continue;
        const key = `${note.id_eleve}:${sequence.id_trimestre}`;
        if (dejaActualises.has(key)) continue;
        dejaActualises.add(key);
        await refreshQuarter(
          tx,
          note.id_eleve,
          a.id_affectation_cours,
          sequence,
          nouveauCoefficient
        );
      }
    }, { timeout: 20000 });

    return c.json({
      success: true,
      message: 'Notes et coefficient enregistrés',
      coefficient: Number(nouveauCoefficient),
      est_verrouille: false
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'LOCKED') {
      return error(c, 'Notes validées : modification interdite. Demandez une réouverture à l’administration.', 409);
    }
    if (e instanceof Error && e.message === 'COEFFICIENT_LOCKED') {
      return error(c, 'Impossible de modifier le coefficient : une séquence de ce cours est déjà verrouillée.', 409);
    }
    if (e instanceof Error && e.message === 'INVALID_STUDENTS') {
      return error(c, 'Un ou plusieurs élèves ne sont pas inscrits dans cette classe');
    }
    console.error('Sauvegarde des notes', e);
    return error(c, 'Échec de la sauvegarde', 400);
  }
});

app.post('/notes/valider', async c => {
  const parsed = targetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const target = await resolveTarget(c, parsed.data);
  if (target.failure) return target.failure;
  const { a, s, year } = target;
  if (!a || !s || !year) {
  return error(c, 'Cours, séquence ou année scolaire introuvable.', 404);
}
  try {
    const result = await prisma.$transaction(async tx => {
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), 0)`;
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
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id_affectation_cours}), 0)`;
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
const assignment = await resolveAuthorizedAssignment(
  c,
  q.data.id_matiere,
  q.data.id_classe,
  year.id_annee
);

if (assignment.failure) return assignment.failure;

const a = assignment.a;

if (!a) {
  return error(c, 'Cours introuvable', 404);
}
  const t = await prisma.trimestre.findFirst({
    where: { id_trimestre: q.data.id_trimestre, id_annee: year.id_annee },
    include: { sequences: { orderBy: { numero_sequence: 'asc' } } }
  });
  if (!t) return error(c, 'Trimestre introuvable', 404);
  const { cc, eva } = rolesTrimestre(t);
  if (!cc || !eva || t.sequences.length !== 2) {
    return error(c, 'Ce trimestre doit contenir exactement deux séquences (CC puis Éva de niveau)', 409);
  }
  const [students, grades] = await Promise.all([
    prisma.affectationEleve.findMany({
      where: { id_classe: a.id_classe, id_annee: year.id_annee },
      include: { eleve: true },
      orderBy: { eleve: { nom_complet: 'asc' } }
    }),
    prisma.note.findMany({
      where: { id_affectation_cours: a.id_affectation_cours, id_sequence: { in: [cc.id_sequence, eva.id_sequence] } }
    })
  ]);
  const notesParEleve = new Map<string, { cc?: Prisma.Decimal; eva?: Prisma.Decimal }>();
  for (const note of grades) {
    const entry = notesParEleve.get(note.id_eleve) ?? {};
    if (note.id_sequence === cc.id_sequence) entry.cc = note.valeur_note;
    if (note.id_sequence === eva.id_sequence) entry.eva = note.valeur_note;
    notesParEleve.set(note.id_eleve, entry);
  }
  return c.json({
    coefficient: num(a.coefficient),
    resultats: students.map(({ eleve }) => {
      const notes = notesParEleve.get(eleve.id_eleve);
      const resultat = calculerTrimestre(notes?.cc, notes?.eva, a.coefficient);
      return {
        id_eleve: eleve.id_eleve,
        nom_complet: eleve.nom_complet,
        note_cc: notes?.cc == null ? null : num(notes.cc),
        note_eva: notes?.eva == null ? null : num(notes.eva),
        somme_notes: resultat ? num(resultat.somme) : null,
        moyenne_trimestrielle: resultat ? num(resultat.moyenne) : null,
        moyenne_x_coefficient: resultat ? num(resultat.moyenneXCoef) : null
      };
    })
  });
});

const trimestreTargetSchema = z.object({ id_classe: uuid, id_matiere: uuid, id_trimestre: uuid });

async function resolveTrimestre(c: any, input: z.infer<typeof trimestreTargetSchema>) {
  const year = await activeYear();
  if (!year) return { failure: error(c, 'Aucune année active') };
  const assignment = await resolveAuthorizedAssignment(c, input.id_matiere, input.id_classe, year.id_annee);
  if (assignment.failure) {
  return { failure: assignment.failure };
}
  const a = assignment.a;
  const t = await prisma.trimestre.findFirst({
    where: { id_trimestre: input.id_trimestre, id_annee: year.id_annee },
    include: { sequences: { orderBy: { numero_sequence: 'asc' } } }
  });
  if (!t) return { failure: error(c, 'Trimestre introuvable', 404) };
  const { cc, eva } = rolesTrimestre(t);
  if (!cc || !eva || t.sequences.length !== 2) {
    return { failure: error(c, 'Ce trimestre doit contenir exactement deux séquences (CC puis Éva de niveau)', 409) };
  }
  return { a, t, year, cc, eva };
}

app.get('/notes/grille-trimestre', async c => {
  const q = trimestreTargetSchema.safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const target = await resolveTrimestre(c, q.data);
  if (target.failure) return target.failure;
  const { a, t, year, cc, eva } = target;
  if (!a || !t || !year || !cc || !eva) {
  return error(c, 'Données du trimestre incomplètes.', 404);
}

  const [students, grades, locks] = await Promise.all([
    prisma.affectationEleve.findMany({
      where: { id_classe: a.id_classe, id_annee: year.id_annee },
      include: { eleve: true },
      orderBy: { eleve: { nom_complet: 'asc' } }
    }),
    prisma.note.findMany({
      where: { id_affectation_cours: a.id_affectation_cours, id_sequence: { in: [cc.id_sequence, eva.id_sequence] } }
    }),
    // tous les verrous du cours (toutes séquences) : le coefficient est commun au cours entier
    prisma.verrouillageNote.findMany({ where: { id_affectation_cours: a.id_affectation_cours, est_verrouille: true } })
  ]);

  const lockOf = (id_sequence: string) => locks.find(l => l.id_sequence === id_sequence);
  const notesDe = (id_sequence: string) =>
    new Map(grades.filter(n => n.id_sequence === id_sequence).map(n => [n.id_eleve, n.valeur_note]));
  const ccNotes = notesDe(cc.id_sequence);
  const evaNotes = notesDe(eva.id_sequence);
  const colonne = (s: typeof cc, type: 'cc' | 'eva', libelle: string, poids: number) => ({
    id_sequence: s.id_sequence,
    type,
    libelle,
    poids,
    est_verrouille: Boolean(lockOf(s.id_sequence)),
    date_verrouillage: lockOf(s.id_sequence)?.date_verrouillage ?? null
  });

  return c.json({
    id_affectation_cours: a.id_affectation_cours,
    id_trimestre: t.id_trimestre,
    numero_trimestre: t.numero_trimestre,
    coefficient: num(a.coefficient),
    coefficient_modifiable: locks.length === 0,
    colonnes: {
      cc: colonne(cc, 'cc', libelleCC(t.numero_trimestre), 30),
      eva: colonne(eva, 'eva', libelleEva(t.numero_trimestre), 70)
    },
    grille: students.map(({ eleve }) => {
      const noteCC = ccNotes.get(eleve.id_eleve);
      const noteEva = evaNotes.get(eleve.id_eleve);
      const r = calculerTrimestre(noteCC, noteEva, a.coefficient);
      return {
        id_eleve: eleve.id_eleve,
        nom_complet: eleve.nom_complet,
        note_cc: noteCC == null ? null : num(noteCC),
        note_eva: noteEva == null ? null : num(noteEva),
        moyenne_trimestrielle: r ? num(r.moyenne) : null,
        note_x_coefficient: r ? num(r.moyenneXCoef) : null
      };
    })
  });
});

// Enregistrer le brouillon. Règles :
//  - une valeur absente / null n'efface JAMAIS une note déjà enregistrée ;
//  - une colonne verrouillée est ignorée (ses notes ne sont pas touchées).
const sauvegardeTrimestreSchema = trimestreTargetSchema.extend({
  coefficient: z.number().finite().min(0.01).max(99.99),
  notes: z.array(z.object({
    id_eleve: uuid,
    note_cc: z.number().finite().min(0).max(20).nullable().optional(),
    note_eva: z.number().finite().min(0).max(20).nullable().optional()
  })).min(1)
}).superRefine((v, ctx) => {
  const ids = v.notes.map(n => n.id_eleve);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Élève présent plusieurs fois' });
  }
});

app.post('/notes/sauvegarder-trimestre', async c => {
  const parsed = sauvegardeTrimestreSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Données invalides', details: parsed.error.flatten() }, 400);
  const target = await resolveTrimestre(c, parsed.data);
  if (target.failure) return target.failure;
  const { a, t, year, cc, eva } = target;
  if (!a || !t || !year || !cc || !eva) {
  return error(c, 'Données du trimestre incomplètes.', 404);
}
  const ids = parsed.data.notes.map(n => n.id_eleve);
  const nouveauCoefficient = decimal(parsed.data.coefficient).toDecimalPlaces(2);

  try {
    const enregistrees = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), 0)`;

      const verrous = await tx.verrouillageNote.findMany({
        where: { id_affectation_cours: a.id_affectation_cours, est_verrouille: true },
        select: { id_sequence: true }
      });
      const ccVerrouille = verrous.some(v => v.id_sequence === cc.id_sequence);
      const evaVerrouille = verrous.some(v => v.id_sequence === eva.id_sequence);
      if (ccVerrouille && evaVerrouille) throw new Error('ALL_LOCKED');

      const enrolled = await tx.affectationEleve.findMany({
        where: { id_classe: a.id_classe, id_annee: year.id_annee, id_eleve: { in: ids } },
        select: { id_eleve: true }
      });
      if (enrolled.length !== ids.length) throw new Error('INVALID_STUDENTS');

      const cours = await tx.affectationCours.findUniqueOrThrow({
        where: { id_affectation_cours: a.id_affectation_cours },
        select: { coefficient: true }
      });
      const coefficientChange = !cours.coefficient.equals(nouveauCoefficient);

      if (coefficientChange) {
        // Coefficient commun à tout le cours : interdit dès qu'une séquence est verrouillée.
        if (verrous.length > 0) throw new Error('COEFFICIENT_LOCKED');
        await tx.affectationCours.update({
          where: { id_affectation_cours: a.id_affectation_cours },
          data: { coefficient: nouveauCoefficient }
        });
        const anciennes = await tx.note.findMany({
          where: { id_affectation_cours: a.id_affectation_cours },
          select: { id_eleve: true, id_sequence: true, valeur_note: true }
        });
        for (const note of anciennes) {
          await tx.note.update({
            where: {
              id_eleve_id_affectation_cours_id_sequence: {
                id_eleve: note.id_eleve,
                id_affectation_cours: a.id_affectation_cours,
                id_sequence: note.id_sequence
              }
            },
            data: { note_x_coefficient: note.valeur_note.mul(nouveauCoefficient).toDecimalPlaces(2) }
          });
        }
      }

      let total = 0;
      const enregistrer = async (id_eleve: string, id_sequence: string, valeur: number) => {
        const valeur_note = decimal(valeur).toDecimalPlaces(2);
        const note_x_coefficient = valeur_note.mul(nouveauCoefficient).toDecimalPlaces(2);
        await tx.note.upsert({
          where: { id_eleve_id_affectation_cours_id_sequence: { id_eleve, id_affectation_cours: a.id_affectation_cours, id_sequence } },
          update: { valeur_note, note_x_coefficient },
          create: { id_eleve, id_affectation_cours: a.id_affectation_cours, id_sequence, valeur_note, note_x_coefficient }
        });
        total += 1;
      };
      for (const n of parsed.data.notes) {
        if (!ccVerrouille && n.note_cc != null) await enregistrer(n.id_eleve, cc.id_sequence, n.note_cc);
        if (!evaVerrouille && n.note_eva != null) await enregistrer(n.id_eleve, eva.id_sequence, n.note_eva);
      }

      // Recalcul des moyennes de trimestre (30 % CC + 70 % Éva) puis × coefficient
      if (coefficientChange) {
        const trimestres = await tx.trimestre.findMany({
          where: { id_annee: year.id_annee },
          include: { sequences: { orderBy: { numero_sequence: 'asc' } } }
        });
        const eleves = await tx.note.findMany({
          where: { id_affectation_cours: a.id_affectation_cours },
          select: { id_eleve: true },
          distinct: ['id_eleve']
        });
        for (const tr of trimestres) {
          for (const e of eleves) await refreshTrimestre(tx, e.id_eleve, a.id_affectation_cours, tr, nouveauCoefficient);
        }
      } else {
        for (const id_eleve of ids) await refreshTrimestre(tx, id_eleve, a.id_affectation_cours, t, nouveauCoefficient);
      }
      return total;
    }, { timeout: 20000 });

    return c.json({
      success: true,
      message: 'Notes et coefficient enregistrés',
      coefficient: Number(nouveauCoefficient),
      notes_enregistrees: enregistrees
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'ALL_LOCKED') return error(c, 'CC et Éva de niveau sont déjà verrouillés. Demandez une réouverture à l’administration.', 409);
    if (e instanceof Error && e.message === 'COEFFICIENT_LOCKED') return error(c, 'Impossible de modifier le coefficient : une séquence de ce cours est déjà verrouillée.', 409);
    if (e instanceof Error && e.message === 'INVALID_STUDENTS') return error(c, 'Un ou plusieurs élèves ne sont pas inscrits dans cette classe');
    console.error('Sauvegarde trimestre', e);
    return error(c, 'Échec de la sauvegarde', 400);
  }
});

// Verrouiller : 'cc' seul, 'eva' seule, ou 'tout'.
// Ce qui est DÉJÀ verrouillé n'est jamais retouché (date et administrateur conservés) :
// « tout » verrouille simplement ce qui ne l'est pas encore.
app.post('/notes/valider-trimestre', async c => {
  const parsed = trimestreTargetSchema.extend({ parties: z.enum(['cc', 'eva', 'tout']) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const target = await resolveTrimestre(c, parsed.data);
  if (target.failure) return target.failure;
  const { a, t, year, cc, eva } = target;
  if (!a || !t || !year || !cc || !eva) {
  return error(c, 'Données du trimestre incomplètes.', 404);
}
  const { parties } = parsed.data;

  try {
    const verrouilles = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.id_affectation_cours}), 0)`;

      const enrolled = await tx.affectationEleve.findMany({
        where: { id_classe: a.id_classe, id_annee: year.id_annee },
        select: { id_eleve: true }
      });
      if (!enrolled.length) throw new Error('EMPTY_CLASS');

      const cibles = [
        ...(parties !== 'eva' ? [{ seq: cc, label: libelleCC(t.numero_trimestre) }] : []),
        ...(parties !== 'cc' ? [{ seq: eva, label: libelleEva(t.numero_trimestre) }] : [])
      ];
      const dejaVerrouilles = new Set(
        (await tx.verrouillageNote.findMany({
          where: { id_affectation_cours: a.id_affectation_cours, id_sequence: { in: cibles.map(x => x.seq.id_sequence) }, est_verrouille: true },
          select: { id_sequence: true }
        })).map(v => v.id_sequence)
      );
      const aVerrouiller = cibles.filter(x => !dejaVerrouilles.has(x.seq.id_sequence));
      if (!aVerrouiller.length) throw new Error('ALREADY_LOCKED');

      // Tout doit être complet avant de verrouiller quoi que ce soit (tout ou rien)
      for (const cible of aVerrouiller) {
        const nb = await tx.note.count({
          where: {
            id_affectation_cours: a.id_affectation_cours,
            id_sequence: cible.seq.id_sequence,
            id_eleve: { in: enrolled.map(e => e.id_eleve) }
          }
        });
        if (nb !== enrolled.length) throw new Error(`INCOMPLETE:${cible.label}`);
      }

      const actor = c.get('actor');
      const id_admin = actor.role === 'admin' ? actor.id : null;
      const maintenant = new Date();
      for (const cible of aVerrouiller) {
        await tx.verrouillageNote.upsert({
          where: { id_affectation_cours_id_sequence: { id_affectation_cours: a.id_affectation_cours, id_sequence: cible.seq.id_sequence } },
          update: { est_verrouille: true, date_verrouillage: maintenant, id_admin },
          create: { id_affectation_cours: a.id_affectation_cours, id_sequence: cible.seq.id_sequence, est_verrouille: true, date_verrouillage: maintenant, id_admin }
        });
      }
      return aVerrouiller.map(x => x.label);
    }, { timeout: 20000 });

    return c.json({ success: true, message: `Verrouillé : ${verrouilles.join(' et ')}`, verrouilles });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('INCOMPLETE:')) {
      return error(c, `${e.message.slice('INCOMPLETE:'.length)} : tous les élèves de la classe doivent avoir une note avant verrouillage`, 409);
    }
    if (e instanceof Error && e.message === 'EMPTY_CLASS') return error(c, 'Impossible de valider une classe vide', 409);
    if (e instanceof Error && e.message === 'ALREADY_LOCKED') return error(c, 'Déjà verrouillé', 409);
    console.error('Validation trimestre', e);
    return error(c, 'Échec de validation');
  }
});

// ---------------------------------------------------------------------------
// Administration des autorisations enseignant / matière
// Ces routes sont protégées par le middleware JWT de /notes/*.
// ---------------------------------------------------------------------------
app.get('/notes/admin/autorisation-matieres', async c => {
  if (c.get('actor').role !== 'admin') return error(c, 'Réservé à l’administration', 403);
  const q = z.object({ id_enseignant: uuid.optional() }).safeParse(c.req.query());
  if (!q.success) return error(c, 'Paramètres invalides');
  const rows = await prisma.autorisationMatiere.findMany({
    where: q.data.id_enseignant ? { id_enseignant: q.data.id_enseignant } : undefined,
    include: {
      enseignant: { select: { id_enseignant: true, nom_complet: true } },
      matiere: { select: { id_matiere: true, libelle_matiere: true } }
    },
    orderBy: [{ enseignant: { nom_complet: 'asc' } }, { matiere: { libelle_matiere: 'asc' } }]
  });
  return c.json(rows);
});

app.post('/notes/admin/autorisation-matieres', async c => {
  if (c.get('actor').role !== 'admin') return error(c, 'Réservé à l’administration', 403);
  const parsed = z.object({ id_enseignant: uuid, id_matiere: uuid }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const [enseignant, matiere] = await Promise.all([
    prisma.enseignant.findUnique({ where: { id_enseignant: parsed.data.id_enseignant }, select: { id_enseignant: true, est_actif: true } }),
    prisma.matiere.findUnique({ where: { id_matiere: parsed.data.id_matiere }, select: { id_matiere: true } })
  ]);
  if (!enseignant?.est_actif || !matiere) return error(c, 'Enseignant actif ou matière introuvable', 404);
  const autorisation = await prisma.autorisationMatiere.upsert({
    where: { id_enseignant_id_matiere: parsed.data },
    update: {},
    create: parsed.data
  });
  return c.json({ success: true, autorisation });
});

app.delete('/notes/admin/autorisation-matieres', async c => {
  if (c.get('actor').role !== 'admin') return error(c, 'Réservé à l’administration', 403);
  const parsed = z.object({ id_enseignant: uuid, id_matiere: uuid }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return error(c, 'Données invalides');
  const result = await prisma.autorisationMatiere.deleteMany({ where: parsed.data });
  return c.json({ success: true, supprimee: result.count > 0 });
});

// ---------------------------------------------------------------------------
// Dashboard sécurisé par mot de passe
// ---------------------------------------------------------------------------
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
// Exemple : NOTES_2026-2027_6EME-M-1_MATHEMATIQUES_T1-CC_VALIDE.xlsx
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
  partie: 'cc' | 'eva';
  verrouille: boolean;
}) =>
  `NOTES_${slug(p.annee)}_${slug(p.classe)}_${slug(p.matiere)}_T${p.trimestre}-${p.partie === 'cc' ? 'CC' : 'EVA'}_${p.verrouille ? 'VALIDE' : 'BROUILLON'}.xlsx`;

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
  const typeSeq = new Map<string, 'cc' | 'eva'>();
  for (const idTrimestre of new Set(sequences.map(s => s.id_trimestre))) {
    sequences
      .filter(s => s.id_trimestre === idTrimestre)
      .sort((x, y) => x.numero_sequence - y.numero_sequence)
      .forEach((s, index) => typeSeq.set(s.id_sequence, index === 0 ? 'cc' : 'eva'));
  }
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
      type: typeSeq.get(s.id_sequence) ?? 'cc',
      libelle_partie: typeSeq.get(s.id_sequence) === 'eva' ? `Éva de niveau ${s.trimestre.numero_trimestre}` : `CC${s.trimestre.numero_trimestre}`,
      effectif: effectifByClass.get(a.id_classe) ?? 0,
      notes_saisies: counts.get(k) ?? 0,
      statut: verrouille ? 'verrouille' as const : 'brouillon' as const,
      date_verrouillage: lock?.date_verrouillage ?? null,
      nom_fichier: buildFileName({
        annee: year.libelle_annee,
        classe: a.classe.nom_classe,
        matiere: a.matiere.libelle_matiere,
        trimestre: s.trimestre.numero_trimestre,
        partie: typeSeq.get(s.id_sequence) ?? 'cc',
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
  const partie: 'cc' | 'eva' = s.trimestre.sequences
    .slice()
    .sort((x, y) => x.numero_sequence - y.numero_sequence)
    .findIndex(x => x.id_sequence === s.id_sequence) === 0 ? 'cc' : 'eva';
  const libellePartie = partie === 'cc' ? `CC${s.trimestre.numero_trimestre} (30 %)` : `Éva de niveau ${s.trimestre.numero_trimestre} (70 %)`;
  ws.getCell('A2').value = `Relevé de notes, ${libellePartie}`;
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
  header.values = ['N°', 'Nom et prénom(s) de l’élève', 'Note / 20', 'Contribution au trimestre'];
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
    const poids = partie === 'cc' ? 0.30 : 0.70;
    const contribution = note === null ? null : Number((note * poids).toFixed(2));
    if (contribution !== null) { sum += contribution; count += 1; }
    const row = ws.addRow([i + 1, eleve.nom_complet, note, contribution]);
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
    `Contribution moyenne de la classe : ${count ? (sum / count).toFixed(2) : '—'} / 20 (avant coefficient)`,
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
    partie,
    verrouille
  });

  const buffer = await wb.xlsx.writeBuffer();
  return c.body(new Uint8Array(buffer as ArrayBuffer), 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`
  });
});


export default app;
