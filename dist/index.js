// src/index.ts — compatible avec src/routes/note.ts (ou notes.ts)
import 'dotenv/config';
import { Hono } from 'hono';
import { apiReference } from '@scalar/hono-api-reference';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import notesApp from './routes/notes.js';
const app = new Hono();
// CORS : avec credentials=true, autoriser explicitement les origines du frontend.
// Exemple FRONTEND_ORIGINS=http://localhost:5173,https://mon-frontend.example
const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',').map(value => value.trim()).filter(Boolean);
app.use('/api/*', cors({
    origin: origin => allowedOrigins.includes(origin) ? origin : '',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.get('/', c => c.json({ success: true, message: 'API de gestion scolaire active' }));
app.route('/api', notesApp);
const uuid = { type: 'string', format: 'uuid' };
const param = (name, where = 'query') => ({ name, in: where, required: true, schema: uuid });
const jsonBody = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const response = (description) => ({ description });
const auth = [{ BearerAuth: [] }];
const targetProperties = { id_classe: uuid, id_matiere: uuid, id_sequence: uuid };
const targetBody = jsonBody({ type: 'object', properties: targetProperties, required: Object.keys(targetProperties) });
const targetParams = [param('id_classe'), param('id_matiere'), param('id_sequence')];
const restricted = { '400': response('Paramètres invalides ou année inactive'), '401': response('Token manquant ou invalide'), '403': response('Accès refusé'), '404': response('Ressource introuvable') };
const loginBody = jsonBody({
    type: 'object',
    properties: { id: uuid, mot_de_passe: { type: 'string', format: 'password' } },
    required: ['id', 'mot_de_passe'],
});
app.get('/doc', c => c.json({
    openapi: '3.1.0',
    info: {
        title: 'API Gestion Scolaire — Notes, NxC et Verrouillages',
        version: '2.0.0',
        description: 'Contrat des routes exposées par src/routes/note.ts. La validation verrouille les notes, tandis que l’administration peut rouvrir la saisie.',
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Développement local' },
        { url: 'https://note-o1lo.onrender.com', description: 'Production (si ce déploiement est toujours utilisé)' },
    ],
    components: {
        securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        schemas: {
            NoteInput: { type: 'object', properties: { id_eleve: uuid, valeur_note: { type: 'number', minimum: 0, maximum: 20, example: 15.5 } }, required: ['id_eleve', 'valeur_note'] },
            LigneGrille: { type: 'object', properties: { id_eleve: uuid, nom_complet: { type: 'string' }, valeur_note: { type: ['number', 'null'] }, note_x_coefficient: { type: ['number', 'null'] } } },
        },
    },
    tags: [
        { name: 'Configuration' }, { name: 'Authentification' }, { name: 'Notes' },
        { name: 'Résultats trimestriels' }, { name: 'Administration' },
    ],
    paths: {
        '/api/trimestres': { get: { tags: ['Configuration'], summary: 'Trimestres et séquences de l’année active', responses: { '200': response('Liste des trimestres'), '400': response('Aucune année active') } } },
        '/api/sequences': { get: { tags: ['Configuration'], summary: 'Séquences regroupées par trimestre', responses: { '200': response('Trimestres, libellés et séquences'), '400': response('Aucune année active') } } },
        '/api/classes': { get: { tags: ['Configuration'], summary: 'Classes ayant une affectation de cours pour l’année active', responses: { '200': response('Liste des classes'), '400': response('Aucune année active') } } },
        '/api/classes/{id_classe}/matieres': { get: { tags: ['Configuration'], summary: 'Matières et coefficients propres à une classe', parameters: [param('id_classe', 'path')], responses: { '200': response('Matières, id_affectation_cours et coefficient'), '400': response('Classe invalide ou aucune année active') } } },
        '/api/enseignants/filtres': { get: { tags: ['Configuration'], summary: 'Enseignant actif affecté à une matière dans une classe', parameters: [param('id_classe'), param('id_matiere')], responses: { '200': response('Liste avec identifiant et nom de l’enseignant'), '400': response('Paramètres invalides') } } },
        '/api/auth/login': { post: { tags: ['Authentification'], summary: 'Connexion enseignant (mot de passe bcrypt)', description: 'Le corps attend « id » : UUID de l’enseignant, et non « id_enseignant ».', requestBody: loginBody, responses: { '200': response('Token, rôle enseignant et nom complet'), '400': response('Corps invalide'), '401': response('Identifiants incorrects ou compte inactif') } } },
        '/api/admin/auth/login': { post: { tags: ['Authentification'], summary: 'Connexion administrateur (mot de passe bcrypt)', description: 'Le champ « id » contient l’UUID de l’administrateur.', requestBody: loginBody, responses: { '200': response('Token, rôle admin et nom complet'), '400': response('Corps invalide'), '401': response('Identifiants incorrects ou compte inactif') } } },
        '/api/notes/grille': { get: { tags: ['Notes'], summary: 'Grille de saisie ou consultation selon le verrouillage', security: auth, parameters: targetParams, responses: { '200': { description: 'Coefficient, est_verrouille, mode, date_verrouillage et grille avec note/NxC', content: { 'application/json': { schema: { type: 'object', properties: { id_affectation_cours: uuid, id_sequence: uuid, coefficient: { type: 'number' }, est_verrouille: { type: 'boolean' }, date_verrouillage: { type: ['string', 'null'], format: 'date-time' }, mode: { type: 'string', enum: ['saisie', 'lecture_seule'] }, grille: { type: 'array', items: { $ref: '#/components/schemas/LigneGrille' } } } } } } }, ...restricted } } },
        '/api/notes/consultation': { get: { tags: ['Notes'], summary: 'Consulter notes et NxC en lecture seule', description: 'Renvoie les mêmes données que /api/notes/grille. Le frontend doit désactiver les champs si est_verrouille=true.', security: auth, parameters: targetParams, responses: { '200': response('Grille avec état du verrouillage'), ...restricted } } },
        '/api/notes/sauvegarder': { post: { tags: ['Notes'], summary: 'Enregistrer un brouillon et calculer automatiquement NxC', description: 'Refusé après validation définitive. Les notes doivent correspondre à des élèves de la classe.', security: auth, requestBody: jsonBody({ type: 'object', properties: { ...targetProperties, notes: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/NoteInput' } } }, required: [...Object.keys(targetProperties), 'notes'] }), responses: { '200': response('Brouillon enregistré'), ...restricted, '409': response('Notes verrouillées') } } },
        '/api/notes/valider': { post: { tags: ['Notes'], summary: 'Valider définitivement et verrouiller la saisie', description: 'Chaque élève inscrit doit posséder une note. Cette opération est distincte de la sauvegarde.', security: auth, requestBody: targetBody, responses: { '200': response('Notes validées et verrouillées'), ...restricted, '409': response('Notes incomplètes, classe vide ou déjà verrouillée') } } },
        '/api/notes/resultats-trimestriels': { get: { tags: ['Résultats trimestriels'], summary: 'Afficher somme S1+S2, moyenne et moyenne × coefficient', security: auth, parameters: [param('id_classe'), param('id_matiere'), param('id_trimestre')], responses: { '200': response('Coefficient et résultats des élèves (null tant que les deux notes ne sont pas disponibles)'), ...restricted } } },
        '/api/notes/admin/verrouillages': { get: { tags: ['Administration'], summary: 'Lister les verrouillages de l’année active', security: auth, responses: { '200': response('Liste enrichie avec classe, matière, enseignant, séquence et administrateur'), '401': response('Token invalide'), '403': response('Réservé aux administrateurs') } } },
        '/api/notes/admin/deverrouiller': { post: { tags: ['Administration'], summary: 'Rouvrir la saisie d’un cours pour une séquence', security: auth, requestBody: jsonBody({ type: 'object', properties: { id_affectation_cours: uuid, id_sequence: uuid }, required: ['id_affectation_cours', 'id_sequence'] }), responses: { '200': response('Saisie rouverte'), ...restricted } } },
    },
}));
app.get('/reference', apiReference({ url: '/doc', pageTitle: 'Documentation API scolaire — Notes', theme: 'purple' }));
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`🚀 API : http://localhost:${port}`);
console.log(`📚 Documentation : http://localhost:${port}/reference`);
