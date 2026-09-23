import { Router } from 'express';
import {
  attachTagSchema,
  createChecklistItemSchema,
  createLinkSchema,
  createRelationSchema,
  createTagSchema,
  createTicketSchema,
  updateChecklistItemSchema,
  updateTicketSchema,
  ticketFilterParamsSchema,
  listSortFieldsSchema,
} from '@zakisu-tickets/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/sessions.js';
import {
  createTicket,
  getBoard,
  getTicketDetail,
  getTicketByNumber,
  setTicketArchived,
  updateTicket,
  searchTickets,
} from './tickets.service.js';
import {
  getProjectDashboard,
  getAccomplishments,
  getTagsForTickets,
} from './insights.service.js';
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  reorderChecklistItem,
  updateChecklistItem,
} from './checklist.service.js';
import { addLink, deleteLink, listLinks } from './links.service.js';
import { addRelation, deleteRelation, listRelations } from './relations.service.js';
import { attachTag, createTag, deleteTag, detachTag, listProjectTags, listTicketTags } from './tags.service.js';

export const ticketsRouter = Router();
export const projectTicketsRouter = Router();

projectTicketsRouter.use(requireAuth);
ticketsRouter.use(requireAuth);

function requireTicketId(req: { params: Record<string, string> }): string {
  const id = req.params.ticketId;
  if (!id) throw ApiError.validation('Missing ticketId');
  return id;
}

function requireProjectIdParam(req: { params: Record<string, string> }): string {
  const id = req.params.projectId;
  if (!id) throw ApiError.validation('Missing projectId');
  return id;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation('Invalid payload', parsed.error.flatten());
  }
  return parsed.data;
}

// ------------------------------------------------------- project endpoints
// GET /api/projects/:projectId/tickets/board
projectTicketsRouter.get('/:projectId/tickets/board', async (req, res, next) => {
  try {
    const board = await getBoard(requireProjectIdParam(req), req.user!.id);
    res.json({ board });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/tickets — filtered list view
projectTicketsRouter.get('/:projectId/tickets', async (req, res, next) => {
  try {
    const filters = parseBody(ticketFilterParamsSchema, req.query);
    const sort = parseBody(
      z.object({ sortBy: listSortFieldsSchema.optional(), sortDir: z.enum(['asc', 'desc']).optional() }),
      req.query
    );
    const list = await searchTickets(requireProjectIdParam(req), req.user!.id, filters, {
      sortBy: sort.sortBy ?? 'ticketNumber',
      sortDir: sort.sortDir ?? 'asc',
    });
    // Phase 3: attach tag chips in ONE batched query (no N+1 per row).
    const tagMap = await getTagsForTickets(list.tickets.map((t) => t.id));
    res.json({
      ...list,
      tickets: list.tickets.map((t) => ({ ...t, tags: tagMap.get(t.id) ?? [] })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/tickets/by-number/:ticketNumber — direct lookup
projectTicketsRouter.get('/:projectId/tickets/by-number/:ticketNumber', async (req, res, next) => {
  try {
    const ticket = await getTicketByNumber(
      requireProjectIdParam(req),
      req.user!.id,
      req.params.ticketNumber ?? ''
    );
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/dashboard — counts + recent lists
projectTicketsRouter.get('/:projectId/dashboard', async (req, res, next) => {
  try {
    const dashboard = await getProjectDashboard(requireProjectIdParam(req), req.user!.id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/accomplishments — deployed grouped by recency
projectTicketsRouter.get('/:projectId/accomplishments', async (req, res, next) => {
  try {
    const accomplishments = await getAccomplishments(requireProjectIdParam(req), req.user!.id);
    res.json(accomplishments);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/tickets — quick create
projectTicketsRouter.post('/:projectId/tickets', async (req, res, next) => {
  try {
    const input = parseBody(createTicketSchema, req.body);
    const ticket = await createTicket(requireProjectIdParam(req), req.user!.id, input);
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/search?q=... — search within project
projectTicketsRouter.get('/:projectId/search', async (req, res, next) => {
  try {
    const q = parseBody(z.object({ q: z.string().min(1).max(200) }), req.query).q;
    const results = await searchTickets(requireProjectIdParam(req), req.user!.id, { q });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/tags
projectTicketsRouter.get('/:projectId/tags', async (req, res, next) => {
  try {
    const tags = await listProjectTags(requireProjectIdParam(req), req.user!.id);
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/tags
projectTicketsRouter.post('/:projectId/tags', async (req, res, next) => {
  try {
    const input = parseBody(createTagSchema, req.body);
    const tag = await createTag(requireProjectIdParam(req), req.user!.id, input);
    res.status(201).json({ tag });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:projectId/tags/:tagId
projectTicketsRouter.delete('/:projectId/tags/:tagId', async (req, res, next) => {
  try {
    await deleteTag(requireProjectIdParam(req), req.params.tagId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------- ticket endpoints
ticketsRouter.get('/:ticketId', async (req, res, next) => {
  try {
    const ticket = await getTicketDetail(requireTicketId(req), req.user!.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/:ticketId', async (req, res, next) => {
  try {
    const input = parseBody(updateTicketSchema, req.body);
    const ticket = await updateTicket(requireTicketId(req), req.user!.id, input);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/archive', async (req, res, next) => {
  try {
    const ticket = await setTicketArchived(requireTicketId(req), req.user!.id, true);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/restore', async (req, res, next) => {
  try {
    const ticket = await setTicketArchived(requireTicketId(req), req.user!.id, false);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------- checklist
ticketsRouter.get('/:ticketId/checklist', async (req, res, next) => {
  try {
    const items = await listChecklist(requireTicketId(req), req.user!.id);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/checklist', async (req, res, next) => {
  try {
    const input = parseBody(createChecklistItemSchema, req.body);
    const item = await addChecklistItem(requireTicketId(req), req.user!.id, input);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch('/:ticketId/checklist/:itemId', async (req, res, next) => {
  try {
    const input = parseBody(updateChecklistItemSchema, req.body);
    const item = await updateChecklistItem(requireTicketId(req), req.params.itemId, req.user!.id, input);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/checklist/:itemId/reorder', async (req, res, next) => {
  try {
    const input = parseBody(z.object({ direction: z.enum(['up', 'down']) }), req.body);
    const items = await reorderChecklistItem(requireTicketId(req), req.params.itemId, req.user!.id, input);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:ticketId/checklist/:itemId', async (req, res, next) => {
  try {
    await deleteChecklistItem(requireTicketId(req), req.params.itemId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------- links
ticketsRouter.get('/:ticketId/links', async (req, res, next) => {
  try {
    const links = await listLinks(requireTicketId(req), req.user!.id);
    res.json({ links });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/links', async (req, res, next) => {
  try {
    const input = parseBody(createLinkSchema, req.body);
    const link = await addLink(requireTicketId(req), req.user!.id, input);
    res.status(201).json({ link });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:ticketId/links/:linkId', async (req, res, next) => {
  try {
    await deleteLink(requireTicketId(req), req.params.linkId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------- relations
ticketsRouter.get('/:ticketId/relations', async (req, res, next) => {
  try {
    const relations = await listRelations(requireTicketId(req), req.user!.id);
    res.json({ relations });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/relations', async (req, res, next) => {
  try {
    const input = parseBody(createRelationSchema, req.body);
    const relations = await addRelation(requireTicketId(req), req.user!.id, input);
    res.status(201).json({ relations });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:ticketId/relations/:relationId', async (req, res, next) => {
  try {
    await deleteRelation(requireTicketId(req), req.params.relationId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------- tags
ticketsRouter.get('/:ticketId/tags', async (req, res, next) => {
  try {
    const tags = await listTicketTags(requireTicketId(req), req.user!.id);
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post('/:ticketId/tags', async (req, res, next) => {
  try {
    const input = parseBody(attachTagSchema, req.body);
    const tags = await attachTag(requireTicketId(req), req.user!.id, input.tagId);
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete('/:ticketId/tags/:tagId', async (req, res, next) => {
  try {
    const tags = await detachTag(requireTicketId(req), req.user!.id, req.params.tagId);
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});
