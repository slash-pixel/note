// src/routes/parents.ts
import { Hono } from 'hono';
import { notesStore } from '../services/excelsParentsServices.js';

const parentsApp = new Hono();

/**
 * Route : GET /parents/status
 * Permet de vérifier l'état du chargement du fichier Excel en mémoire.
 */
parentsApp.get('/parents/status', (c) => {
  return c.json({
    success: true,
    data: notesStore.getStatus(),
  });
});

/**
 * Route : GET /parents/notes
 * Paramètre attendu : ?matricule=...
 * Exemple : /api/parents/notes?matricule=250143811
 */
parentsApp.get('/parents/notes', (c) => {
  if (!notesStore.isLoaded()) {
    return c.json({
      success: false,
      message: 'Le système de consultation des notes est en cours d’initialisation. Veuillez réessayer dans quelques instants.',
    }, 503);
  }

  const matricule = c.req.query('matricule')?.trim();

  if (!matricule) {
    return c.json({
      success: false,
      message: 'Le paramètre matricule est requis (ex: /api/parents/notes?matricule=250143811)',
    }, 400);
  }

  const result = notesStore.search({ matricule });

  if (!result) {
    return c.json({
      success: false,
      message: `Aucun élève trouvé pour le matricule "${matricule}"`,
    }, 404);
  }

  return c.json({
    success: true,
    data: result,
  });
});

/**
 * Route directe : GET /parents/notes/:matricule
 * Exemple : /api/parents/notes/250143811
 */
parentsApp.get('/parents/notes/:matricule', (c) => {
  if (!notesStore.isLoaded()) {
    return c.json({
      success: false,
      message: 'Le système de consultation des notes est en cours d’initialisation. Veuillez réessayer dans quelques instants.',
    }, 503);
  }

  const matricule = (c.req.param('matricule') || '').trim();

  if (!matricule) {
    return c.json({
      success: false,
      message: 'Le paramètre matricule est requis.',
    }, 400);
  }

  const result = notesStore.search({ matricule });

  if (!result) {
    return c.json({
      success: false,
      message: `Aucun élève trouvé pour le matricule "${matricule}"`,
    }, 404);
  }

  return c.json({
    success: true,
    data: result,
  });
});

export default parentsApp;