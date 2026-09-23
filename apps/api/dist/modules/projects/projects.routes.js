import { Router } from 'express';
import { createProjectSchema, updateProjectSchema, } from '@zakisu-tickets/shared';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/sessions.js';
import { createProject, getProject, listProjects, setProjectArchived, updateProject, } from './projects.service.js';
export const projectsRouter = Router();
projectsRouter.use(requireAuth);
projectsRouter.post('/', async (req, res, next) => {
    try {
        const parsed = createProjectSchema.safeParse(req.body);
        if (!parsed.success) {
            throw ApiError.validation('Invalid project payload', parsed.error.flatten());
        }
        const project = await createProject(req.user.id, parsed.data);
        res.status(201).json({ project });
    }
    catch (err) {
        next(err);
    }
});
projectsRouter.get('/', async (req, res, next) => {
    try {
        const includeArchived = req.query.includeArchived === 'true';
        const projects = await listProjects(req.user.id, includeArchived);
        res.json({ projects });
    }
    catch (err) {
        next(err);
    }
});
function requireProjectId(req) {
    const id = req.params.projectId;
    if (!id)
        throw ApiError.validation('Missing projectId');
    return id;
}
projectsRouter.get('/:projectId', async (req, res, next) => {
    try {
        const project = await getProject(requireProjectId(req), req.user.id);
        res.json({ project });
    }
    catch (err) {
        next(err);
    }
});
projectsRouter.patch('/:projectId', async (req, res, next) => {
    try {
        const parsed = updateProjectSchema.safeParse(req.body);
        if (!parsed.success) {
            throw ApiError.validation('Invalid project payload', parsed.error.flatten());
        }
        const project = await updateProject(requireProjectId(req), req.user.id, parsed.data);
        res.json({ project });
    }
    catch (err) {
        next(err);
    }
});
projectsRouter.post('/:projectId/archive', async (req, res, next) => {
    try {
        const project = await setProjectArchived(requireProjectId(req), req.user.id, true);
        res.json({ project });
    }
    catch (err) {
        next(err);
    }
});
projectsRouter.post('/:projectId/unarchive', async (req, res, next) => {
    try {
        const project = await setProjectArchived(requireProjectId(req), req.user.id, false);
        res.json({ project });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=projects.routes.js.map