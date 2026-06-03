import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  addLessonHandler,
  completeLessonHandler,
  createModuleHandler,
  deleteLessonHandler,
  deleteModuleHandler,
  getModuleHandler,
  listModulesHandler,
  updateLessonHandler,
  updateModuleHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listModulesHandler);
    app.get<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, getModuleHandler);
    app.post(
      '/',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      createModuleHandler,
    );
    app.patch<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      updateModuleHandler,
    );
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      deleteModuleHandler,
    );
    app.post<{ Params: { moduleId: string } }>(
      '/:moduleId/lessons',
      { preHandler: app.authenticate },
      addLessonHandler,
    );
    app.patch<{ Params: { moduleId: string; lessonId: string } }>(
      '/:moduleId/lessons/:lessonId',
      { preHandler: app.authenticate },
      updateLessonHandler,
    );
    app.delete<{ Params: { moduleId: string; lessonId: string } }>(
      '/:moduleId/lessons/:lessonId',
      { preHandler: app.authenticate },
      deleteLessonHandler,
    );
    app.post<{ Params: { moduleId: string; lessonId: string } }>(
      '/:moduleId/lessons/:lessonId/complete',
      { preHandler: app.authenticate },
      completeLessonHandler,
    );
  },
  { name: 'training-routes' },
);
