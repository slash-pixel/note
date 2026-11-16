// src/index.ts — compatible avec src/routes/note.ts (ou notes.ts)
import 'dotenv/config';
import { Hono } from 'hono';
import { apiReference } from '@scalar/hono-api-reference';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import niveauxApp from './routes/niveaux.js';
import notesApp from './routes/notes.js';
import parentsApp from './routes/parents.js';
import { notesStore } from './services/excelsParentsServices.js';

const app = new Hono();

// CORS : avec credentials=true, autoriser explicitement les origines du frontend (incluant Netlify et le développement local).
const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173,http://localhost:3000,https://gesnotes.netlify.app,https://stcharlesborromee.org')
  .split(',').map(value => value.trim()).filter(Boolean);

app.use('/api/*', cors({
  origin: origin => allowedOrigins.includes(origin) ? origin : '',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.get('/', c => c.json({ success: true, message: 'API de gestion scolaire active' }));
app.route('/api', notesApp);
app.route('/api', niveauxApp);
app.route('/api', parentsApp);

const uuid = { type: 'string', format: 'uuid' } as const;
const param = (name: string, where: 'query' | 'path' = 'query') => ({ name, in: where, required: true, schema: uuid });
const jsonBody = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const response = (description: string) => ({ description });
const auth = [{ BearerAuth: [] }];
const targetProperties = { id_classe: uuid, id_matiere: uuid, id_sequence: uuid };
const targetBody = jsonBody({ type: 'object', properties: targetProperties, required: Object.keys(targetProperties) });
const targetParams = [param('id_classe'), param('id_matiere'), param('id_sequence')];
const restricted = { '400': response('Paramètres invalides ou année inactive'), '401': response('Token manquant ou invalide'), '403': response('Accès refusé'), '404': response('Ressource introuvable') };

// Deux schémas de connexion distincts : l'enseignant se connecte par id_enseignant,
// l'administrateur par email (table Administrateur, champ email ajouté nov. 2026).
const enseignantLoginBody = jsonBody({
  type: 'object',
  properties: { id_enseignant: uuid, mot_de_passe: { type: 'string', format: 'password' } },
  required: ['id_enseignant', 'mot_de_passe'],
});
const adminLoginBody = jsonBody({
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email', example: 'admin@college.cm' },
    mot_de_passe: { type: 'string', format: 'password' },
  },
  required: ['email', 'mot_de_passe'],
});
const adminProfilBody = jsonBody({
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    nom_complet: { type: 'string' },
    mot_de_passe: { type: 'string', format: 'password', minLength: 8, description: 'Nouveau mot de passe (optionnel)' },
    mot_de_passe_actuel: { type: 'string', format: 'password', description: 'Requis si email ou mot_de_passe changent' },
  },
});

app.get('/doc', c => c.json({
  openapi: '3.1.0',
  info: {
    title: 'API Gestion Scolaire — Notes, NxC et Verrouillages',
    version: '2.1.0',
    description: 'Contrat des routes exposées par src/routes/notes.ts et src/routes/niveaux.ts. La validation verrouille les notes, tandis que l’administration peut rouvrir la saisie. Le dashboard et le déverrouillage des notes partagent désormais le même compte administrateur (email + mot de passe).',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Développement local' },
    { url: 'https://note-o1lo.onrender.com', description: 'Production (Render)' },
  ],
  components: {
    securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      NoteInput: { type: 'object', properties: { id_eleve: uuid, valeur_note: { type: 'number', minimum: 0, maximum: 20, example: 15.5 } }, required: ['id_eleve', 'valeur_note'] },
      LigneGrille: { type: 'object', properties: { id_eleve: uuid, nom_complet: { type: 'string' }, valeur_note: { type: ['number', 'null'] }, note_x_coefficient: { type: ['number', 'null'] } } },
      ParentNoteItem: {
        type: 'object',
        properties: {
          matiere: { type: 'string', example: 'MATHEMATIQUES (Ecrite)' },
          trimestre: { type: 'string', example: '1er trimestre' },
          coefficient: { type: 'number', example: 4 },
          moyenneInterro: { type: 'number', example: 13.5 },
          devoir1: { type: 'number', example: 14 },
          devoir2: { type: 'number', example: 12 },
          composition: { type: 'number', example: 15 },
          moyenneGenerale: { type: 'number', example: 14.2 },
          moyenneCoef: { type: 'number', example: 56.8 },
          rang: { type: 'string', example: '2e' },
          mention: { type: 'string', example: 'Bien' },
          familleMatiere: { type: 'string', example: 'Matières scientifiques' },
          anneeScolaire: { type: 'string', example: '2026 - 2027' },
        },
      },
      ParentStudentResult: {
        type: 'object',
        properties: {
          codeeleve: { type: 'string', example: '565' },
          matricule: { type: 'string', example: '250143811' },
          nomEleve: { type: 'string', example: 'ENENGUE  ISMAËL' },
          anneeScolaire: { type: 'string', example: '2026 - 2027' },
          totalNotes: { type: 'number', example: 40 },
          notes: {
            type: 'array',
            items: { $ref: '#/components/schemas/ParentNoteItem' },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Parents', description: 'Consultation des résultats scolaires par les parents d’élèves' },
    { name: 'Configuration' },
    { name: 'Authentification' },
    { name: 'Notes' },
    { name: 'Résultats trimestriels' },
    { name: 'Administration' },
    { name: 'Configuration' }, { name: 'Authentification' }, { name: 'Notes' },
    { name: 'Résultats trimestriels' }, { name: 'Administration' }, { name: 'Dashboard' }, { name: 'Niveaux' },
  ],
  paths: {
    '/api/parents/notes': {
      get: {
        tags: ['Parents'],
        summary: 'Consulter les notes d’un élève (par matricule ou nom)',
        description: 'Permet à un parent de saisir le matricule de son enfant (ou son code élève) extrait du fichier Excel de notes afin de voir l’intégralité de ses résultats scolaires (matières, coefficients, interrogations, devoirs, compositions, moyennes et rangs).',
        parameters: [
          {
            name: 'matricule',
            in: 'query',
            required: false,
            description: 'Matricule officiel de l’élève ou code élève (ex: 250143811 ou 480)',
            schema: { type: 'string', example: '250143811' },
          },
          {
            name: 'nom',
            in: 'query',
            required: false,
            description: 'Nom de l’élève pour recherche partielle (ex: ENENGUE)',
            schema: { type: 'string', example: 'ENENGUE' },
          },
          {
            name: 'q',
            in: 'query',
            required: false,
            description: 'Terme de recherche global (matricule ou nom)',
            schema: { type: 'string', example: '250143811' },
          },
        ],
        responses: {
          '200': {
            description: 'Résultats scolaires de l’élève trouvés',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/ParentStudentResult' },
                  },
                },
              },
            },
          },
          '400': response('Paramètre matricule ou nom manquant'),
          '404': response('Aucun élève trouvé pour ce matricule/nom'),
          '503': response('Fichier Excel en cours d’initialisation en mémoire'),
        },
      },
    },
    '/api/parents/notes/{matricule}': {
      get: {
        tags: ['Parents'],
        summary: 'Consulter directement les notes via l’URL (par matricule)',
        description: 'Accès direct et immédiat aux résultats de l’enfant en spécifiant son matricule directement dans le chemin de l’URL (ex: /api/parents/notes/250143811).',
        parameters: [
          {
            name: 'matricule',
            in: 'path',
            required: true,
            description: 'Matricule officiel de l’élève ou code élève (ex: 250143811 ou 480)',
            schema: { type: 'string', example: '250143811' },
          },
        ],
        responses: {
          '200': {
            description: 'Résultats scolaires de l’élève trouvés',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/ParentStudentResult' },
                  },
                },
              },
            },
          },
          '400': response('Matricule invalide ou manquant'),
          '404': response('Aucun élève trouvé pour ce matricule'),
          '503': response('Fichier Excel en cours d’initialisation en mémoire'),
        },
      },
    },
    '/api/parents/status': {
      get: {
        tags: ['Parents'],
        summary: 'État du chargement du fichier Excel en mémoire',
        description: 'Permet de vérifier le nombre d’élèves indexés, le nombre total de notes et le chemin du fichier Excel chargé.',
        responses: {
          '200': response('Statut du store et informations de mémoire'),
        },
      },
    },
    '/api/trimestres': { get: { tags: ['Configuration'], summary: 'Trimestres et séquences de l’année active', responses: { '200': response('Liste des trimestres'), '400': response('Aucune année active') } } },
    '/api/sequences': { get: { tags: ['Configuration'], summary: 'Séquences regroupées par trimestre', responses: { '200': response('Trimestres, libellés et séquences'), '400': response('Aucune année active') } } },
    '/api/classes': { get: { tags: ['Configuration'], summary: 'Liste de toutes les classes', responses: { '200': response('Liste des classes'), '400': response('Aucune année active') } } },
    '/api/classes/{id_classe}/matieres': { get: { tags: ['Configuration'], summary: 'Matières et coefficients déjà affectés à une classe', parameters: [param('id_classe', 'path')], responses: { '200': response('Matières, id_affectation_cours et coefficient'), '400': response('Classe invalide ou aucune année active') } } },
    '/api/matieres': { get: { tags: ['Configuration'], summary: 'Liste de toutes les matières', responses: { '200': response('Liste des matières') } } },
    '/api/enseignants': { get: { tags: ['Configuration'], summary: 'Liste des enseignants actifs', responses: { '200': response('id_enseignant et nom_complet') } } },
    '/api/enseignants/{id_enseignant}/matieres': { get: { tags: ['Configuration'], summary: 'Matières autorisées pour un enseignant', description: 'Filtré par AutorisationMatiere : c’est ce qui garantit que chaque enseignant ne voit que sa propre matière.', parameters: [param('id_enseignant', 'path')], responses: { '200': response('Matières autorisées'), '404': response('Enseignant introuvable ou inactif') } } },
    '/api/enseignants/filtres': { get: { tags: ['Configuration'], summary: 'Enseignants autorisés pour une matière donnée', parameters: [param('id_matiere')], responses: { '200': response('Liste avec identifiant et nom de l’enseignant'), '400': response('Paramètres invalides') } } },
    '/api/auth/login': { post: { tags: ['Authentification'], summary: 'Connexion enseignant (mot de passe bcrypt)', description: 'Le corps attend id_enseignant (UUID) et mot_de_passe.', requestBody: enseignantLoginBody, responses: { '200': response('Token, rôle enseignant et nom complet'), '400': response('Corps invalide'), '401': response('Identifiants incorrects ou compte inactif') } } },
    '/api/admin/auth/login': { post: { tags: ['Authentification'], summary: 'Connexion administrateur (email + mot de passe bcrypt)', description: 'Le même compte sert à la fois pour /api/dashboard/* et pour /api/notes/admin/deverrouiller.', requestBody: adminLoginBody, responses: { '200': response('Token, rôle admin, nom complet et email'), '400': response('Corps invalide'), '401': response('Identifiants incorrects ou compte inactif') } } },
    '/api/notes/grille': { get: { tags: ['Notes'], summary: 'Grille de saisie ou consultation selon le verrouillage', security: auth, parameters: targetParams, responses: { '200': { description: 'Coefficient, est_verrouille, mode, date_verrouillage et grille avec note/NxC', content: { 'application/json': { schema: { type: 'object', properties: { id_affectation_cours: uuid, id_sequence: uuid, coefficient: { type: 'number' }, est_verrouille: { type: 'boolean' }, date_verrouillage: { type: ['string', 'null'], format: 'date-time' }, mode: { type: 'string', enum: ['saisie', 'lecture_seule'] }, grille: { type: 'array', items: { $ref: '#/components/schemas/LigneGrille' } } } } } } }, ...restricted } } },
    '/api/notes/consultation': { get: { tags: ['Notes'], summary: 'Consulter notes et NxC en lecture seule', security: auth, parameters: targetParams, responses: { '200': response('Grille avec état du verrouillage'), ...restricted } } },
    '/api/notes/sauvegarder': { post: { tags: ['Notes'], summary: 'Enregistrer un brouillon et calculer automatiquement NxC', description: 'Crée le cours (AffectationCours) à la volée si l’enseignant est autorisé pour cette matière et qu’aucun autre enseignant n’y est déjà affecté. Refusé après validation définitive.', security: auth, requestBody: jsonBody({ type: 'object', properties: { ...targetProperties, notes: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/NoteInput' } } }, required: [...Object.keys(targetProperties), 'notes'] }), responses: { '200': response('Brouillon enregistré'), ...restricted, '409': response('Notes verrouillées') } } },
    '/api/notes/valider': { post: { tags: ['Notes'], summary: 'Valider définitivement et verrouiller la saisie', security: auth, requestBody: targetBody, responses: { '200': response('Notes validées et verrouillées'), ...restricted, '409': response('Notes incomplètes, classe vide ou déjà verrouillée') } } },
    '/api/notes/resultats-trimestriels': { get: { tags: ['Résultats trimestriels'], summary: 'Afficher somme CC+Éva, moyenne (30/70) et moyenne × coefficient', security: auth, parameters: [param('id_classe'), param('id_matiere'), param('id_trimestre')], responses: { '200': response('Coefficient et résultats des élèves (null tant que CC et Éva ne sont pas disponibles)'), ...restricted } } },
    '/api/notes/admin/verrouillages': { get: { tags: ['Administration'], summary: 'Lister les verrouillages de l’année active', security: auth, responses: { '200': response('Liste enrichie avec classe, matière, enseignant, séquence et administrateur'), '401': response('Token invalide'), '403': response('Réservé aux administrateurs') } } },
    '/api/notes/admin/deverrouiller': { post: { tags: ['Administration'], summary: 'Rouvrir la saisie d’un cours pour une séquence', security: auth, requestBody: jsonBody({ type: 'object', properties: { id_affectation_cours: uuid, id_sequence: uuid }, required: ['id_affectation_cours', 'id_sequence'] }), responses: { '200': response('Saisie rouverte'), ...restricted } } },
    '/api/notes/admin/autorisation-matieres': {
      get: { tags: ['Administration'], summary: 'Lister les autorisations enseignant/matière', security: auth, parameters: [{ ...param('id_enseignant'), required: false }], responses: { '200': response('Liste des autorisations'), '403': response('Réservé aux administrateurs') } },
      post: { tags: ['Administration'], summary: 'Autoriser un enseignant à enseigner une matière', security: auth, requestBody: jsonBody({ type: 'object', properties: { id_enseignant: uuid, id_matiere: uuid }, required: ['id_enseignant', 'id_matiere'] }), responses: { '200': response('Autorisation créée ou déjà existante'), '403': response('Réservé aux administrateurs'), '404': response('Enseignant actif ou matière introuvable') } },
      delete: { tags: ['Administration'], summary: 'Retirer une autorisation enseignant/matière', security: auth, requestBody: jsonBody({ type: 'object', properties: { id_enseignant: uuid, id_matiere: uuid }, required: ['id_enseignant', 'id_matiere'] }), responses: { '200': response('Autorisation supprimée (ou absente)'), '403': response('Réservé aux administrateurs') } },
    },
    '/api/dashboard/profil': {
      get: { tags: ['Dashboard'], summary: 'Profil de l’administrateur connecté', description: 'Connexion via POST /api/admin/auth/login puis Authorization: Bearer <token>, ou ?token=... sur les liens d’export.', security: auth, responses: { '200': response('id_admin, email, nom_complet, est_actif'), '401': response('Token manquant ou invalide'), '403': response('Compte administrateur inactif') } },
      put: { tags: ['Dashboard'], summary: 'Modifier son email, son mot de passe ou son nom', description: 'id_admin non modifiable. mot_de_passe_actuel obligatoire dès que email ou mot_de_passe changent.', security: auth, requestBody: adminProfilBody, responses: { '200': response('Profil mis à jour'), '400': response('Données invalides ou aucune modification fournie'), '401': response('Mot de passe actuel incorrect'), '409': response('Email déjà utilisé par un autre administrateur') } },
    },
    '/api/dashboard/liste': { get: { tags: ['Dashboard'], summary: 'Liste des fichiers de notes (brouillon ou verrouillés)', security: auth, responses: { '200': response('Année active et liste des cours/séquences avec statut'), '400': response('Aucune année active') } } },
    '/api/dashboard/export': { get: { tags: ['Dashboard'], summary: 'Exporter un relevé de notes trimestriel en Excel', security: auth, parameters: [param('id_affectation_cours'), param('id_sequence')], responses: { '200': response('Fichier .xlsx'), ...restricted } } },
  },
}));

app.get('/reference', apiReference({
  url: '/doc',
  pageTitle: 'Documentation API scolaire — Notes & Espace Parents',
  theme: 'purple',
}));

// Chargement du fichier Excel de notes en mémoire au démarrage du serveur
const excelFilePath = process.env.EXCEL_NOTES_PATH || 'Notes_au_06_11_2026.xlsx';
try {
  await notesStore.loadExcel(excelFilePath);
} catch (error) {
  console.error(`⚠️ Avertissement : Impossible de précharger le fichier Excel "${excelFilePath}" :`, error);
}

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`🚀 API : http://localhost:${port}`);
console.log(`📚 Documentation : http://localhost:${port}/reference`);
