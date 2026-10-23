// src/index.ts
import { Hono } from 'hono';
import { apiReference } from '@scalar/hono-api-reference';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import notesApp from './routes/note.js';

const app = new Hono();

// Configuration CORS pour autoriser le frontend à communiquer avec l'API
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// 0. Route d'accueil
app.get('/', (c) => {
  return c.text('Hello Hono - API de Gestion Scolaire active ! 🚀');
});

// 1. Montage de vos routes sous le préfixe /api
app.route('/api', notesApp);

// 2. Documentation interactive Scalar
app.get(
  '/reference',
  apiReference({
    url: '/doc',
    pageTitle: 'Documentation API Scolaire - Notes & Séquences',
    theme: 'purple',
  })
);

// 3. Spécification OpenAPI complète basée sur vos routes réelles
app.get('/doc', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'API Gestion Scolaire - Notes & Séquences',
      version: '1.0.0',
      description: 'Documentation interactive de l’API de gestion des notes, séquences et affectations scolaires.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Serveur de développement local',
      },
      {
        url: 'https://note-o1lo.onrender.com',
        description: 'Serveur de production (Render)',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Entrez votre token JWT obtenu via /api/auth/login',
        },
      },
    },
    paths: {
      '/api/trimestres': {
        get: {
          summary: 'Récupérer les trimestres de l’année active',
          tags: ['Paramètres & Configuration'],
          responses: {
            '200': { description: 'Liste des trimestres avec leurs séquences' },
            '400': { description: 'Aucune année active trouvée' },
          },
        },
      },
      '/api/classes': {
        get: {
          summary: 'Récupérer les classes de l’année active',
          tags: ['Paramètres & Configuration'],
          responses: {
            '200': { description: 'Liste des classes' },
            '400': { description: 'Aucune année active trouvée' },
          },
        },
      },
      '/api/classes/{id_classe}/matieres': {
        get: {
          summary: 'Récupérer les matières d’une classe spécifique',
          tags: ['Paramètres & Configuration'],
          parameters: [
            {
              name: 'id_classe',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'ID de la classe (UUID)',
            },
          ],
          responses: {
            '200': { description: 'Liste des matières enseignées dans cette classe' },
            '400': { description: 'Aucune année active trouvée' },
          },
        },
      },
      '/api/enseignants/filtres': {
        get: {
          summary: 'Filtrer les enseignants par classe et matière',
          tags: ['Paramètres & Configuration'],
          parameters: [
            {
              name: 'id_classe',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'id_matiere',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Liste des enseignants correspondants' },
            '400': { description: 'Aucune année active trouvée' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Connexion d’un enseignant',
          tags: ['Authentification'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id_enseignant: { type: 'string', format: 'uuid', example: 'uuid-enseignant' },
                    mot_de_passe: { type: 'string', example: 'Borromee2026' },
                  },
                  required: ['id_enseignant', 'mot_de_passe'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Connexion réussie (retourne le token JWT)' },
            '400': { description: 'Données invalides' },
            '401': { description: 'Mot de passe incorrect' },
            '403': { description: 'Accès refusé ou enseignant inactif' },
          },
        },
      },
      '/api/notes/grille': {
        get: {
          summary: 'Afficher la grille des notes pour saisie (Sécurisé)',
          tags: ['Notes'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id_classe', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'id_matiere', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'id_sequence', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Grille des élèves avec leurs notes existantes' },
            '401': { description: 'Token manquant, invalide ou expiré' },
            '400': { description: 'Aucune année active trouvée' },
          },
        },
      },
      '/api/notes/sauvegarder': {
        post: {
          summary: 'Enregistrer ou mettre à jour un lot de notes (Sécurisé)',
          tags: ['Notes'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id_classe: { type: 'string', format: 'uuid' },
                    id_matiere: { type: 'string', format: 'uuid' },
                    id_sequence: { type: 'string', format: 'uuid' },
                    notes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id_eleve: { type: 'string', format: 'uuid' },
                          valeur_note: { type: 'number', example: 15.5 },
                        },
                        required: ['id_eleve', 'valeur_note'],
                      },
                    },
                  },
                  required: ['id_classe', 'id_matiere', 'id_sequence', 'notes'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Notes enregistrées avec succès' },
            '400': { description: 'Données de notes invalides' },
            '401': { description: 'Non autorisé / Token invalide' },
          },
        },
      },
    },
  });
});

// 4. Lancement du serveur
const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
console.log(`📚 Documentation disponible sur http://localhost:${port}/reference`);

serve({
  fetch: app.fetch,
  port,
});