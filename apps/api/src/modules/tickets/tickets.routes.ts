import { Router } from 'express';
import { createTicketSchema, updateTicketSchema } from '@zakisu-tickets/shared';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/sessions.js';
import {
  createTicket,
  getBoard,
  getTicketDetail,
  setTicketArchived,
  updateTicket,
} from './tickets.service.js';

export const ticketsRouter = Router();
export const projectTicketsRouter = Router();

projectTicketsRouter.use(requireAuth);

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

// GET /api/projects/:projectId/tickets/board
projectTicketsRouter.get('/:projectId/tickets/board', async (req, res, next) => {
  try {
    const board = await getBoard(requireProjectIdParam(req), req.user!.id);
    res.json({ board });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/tickets — quick create
projectTicketsRouter.post('/:projectId/tickets', async (req, res, next) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.validation('Invalid ticket payload', parsed.error.flatten());
    }
    const ticket = await createTicket(requireProjectIdParam(req), req.user!.id, parsed.data);
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.use(requireAuth);

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
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.validation('Invalid ticket payload', parsed.error.flatten());
    }
    const ticket = await updateTicket(requireTicketId(req), req.user!.id, parsed.data);
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
