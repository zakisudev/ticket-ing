import { z } from 'zod';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketActivityType,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from './enums.js';

export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketTypeSchema = z.enum(TICKET_TYPES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

const longText = z.string().max(60_000);

/** Quick create: title plus optional overrides; defaults applied server-side. */
export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  type: ticketTypeSchema.optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/**
 * Patch body. `version` is mandatory: the server applies the update only when it
 * matches the stored version, otherwise responds 409 STALE_UPDATE.
 */
export const updateTicketSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(500).nullable().optional(),
  description: longText.nullable().optional(),
  motivation: longText.nullable().optional(),
  acceptanceCriteria: longText.nullable().optional(),
  implementationNotes: longText.nullable().optional(),
  testingNotes: longText.nullable().optional(),
  deploymentNotes: longText.nullable().optional(),
  limitations: longText.nullable().optional(),
  knownIssues: longText.nullable().optional(),
  followUpNotes: longText.nullable().optional(),
  sourceReference: z.string().max(300).nullable().optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  type: ticketTypeSchema.optional(),
  blockedReason: z.string().trim().max(500).nullable().optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export interface TicketDto {
  id: string;
  projectId: string;
  projectKey: string;
  displayId: string;
  ticketNumber: number;
  /** Optimistic-concurrency counter; must be echoed back on PATCH. */
  version: number;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  summary: string | null;
  description: string | null;
  motivation: string | null;
  acceptanceCriteria: string | null;
  implementationNotes: string | null;
  testingNotes: string | null;
  deploymentNotes: string | null;
  limitations: string | null;
  knownIssues: string | null;
  followUpNotes: string | null;
  blockedReason: string | null;
  sourceReference: string | null;
  archivedAt: string | null;
  startedAt: string | null;
  implementedAt: string | null;
  testedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketActivityDto {
  id: string;
  ticketId: string;
  type: TicketActivityType;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  /** Monotonic sequence for stable ordering within the same second. */
  seq: number;
}

export interface TicketDetailDto extends TicketDto {
  activity: TicketActivityDto[];
}

export interface BoardColumnDto {
  status: TicketStatus;
  tickets: TicketDto[];
}

export interface BoardDto {
  projectId: string;
  projectKey: string;
  /**
   * Six columns: the five workflow stages followed by a distinct BLOCKED column.
   * Blocked work is never silently mixed into a workflow stage; ARCHIVED is excluded.
   */
  columns: BoardColumnDto[];
}
