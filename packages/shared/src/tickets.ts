import { z } from 'zod';
import {
  TICKET_LINK_TYPES,
  TICKET_PRIORITIES,
  TICKET_RELATION_TYPES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketActivityType,
  type TicketLinkType,
  type TicketPriority,
  type TicketRelationPresentationType,
  type TicketStatus,
  type TicketType,
} from './enums.js';

export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketTypeSchema = z.enum(TICKET_TYPES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const ticketLinkTypeSchema = z.enum(TICKET_LINK_TYPES);
export const ticketRelationTypeSchema = z.enum(TICKET_RELATION_TYPES);

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
  /** Blocking requires a non-empty blockedReason; unblocking clears it server-side. */
  isBlocked: z.boolean().optional(),
  blockedReason: z.string().trim().max(500).nullable().optional(),
  /**
   * Orthogonal archive condition (never a lifecycle status). Treated as a
   * write-only command flag: it is never echoed back in ticket reads.
   */
  archived: z.boolean().optional(),
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
  /** Orthogonal condition: can work currently continue? Independent of status. */
  isBlocked: boolean;
  blockedReason: string | null;
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
  sourceReference: string | null;
  archivedAt: string | null;
  startedAt: string | null;
  implementedAt: string | null;
  testedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Tag chips, attached by list views in one batched query (no N+1).
   * Absent ([]) on endpoints that do not join tags.
   */
  tags?: TagDto[];
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

export interface ChecklistItemDto {
  id: string;
  ticketId: string;
  text: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TicketLinkDto {
  id: string;
  ticketId: string;
  type: TicketLinkType;
  label: string | null;
  url: string;
  createdAt: string;
}

/**
 * One direction of a canonical relation. The DB stores exactly one row
 * (fromTicketId, type, toTicketId); present both directions by deriving inverses
 * (e.g. stored BLOCKS is also presented as BLOCKED_BY from the other side).
 */
export interface TicketRelationDto {
  id: string;
  /** The ticket this DTO is presented FROM. */
  ticketId: string;
  /** Presentation-relative type: canonical or derived inverse. */
  type: TicketRelationPresentationType;
  otherTicketId: string;
  otherDisplayId: string;
  otherTitle: string;
  otherStatus: TicketStatus;
  createdAt: string;
}

export interface TagDto {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface TicketTagDto {
  tag: TagDto;
}

export interface TicketDetailDto extends TicketDto {
  activity: TicketActivityDto[];
  checklist: ChecklistItemDto[];
  links: TicketLinkDto[];
  relations: TicketRelationDto[];
  tags: TagDto[];
}

export interface BoardColumnDto {
  status: TicketStatus;
  tickets: TicketDto[];
}

export interface BoardDto {
  projectId: string;
  projectKey: string;
  /**
   * Exactly the five lifecycle columns. Blocked tickets stay in their lifecycle
   * column with a BLOCKED badge; archived tickets are excluded.
   */
  columns: BoardColumnDto[];
}

// ---------------------------------------------------------------- checklist

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

export const updateChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

export const reorderChecklistSchema = z.object({
  direction: z.enum(['up', 'down']),
});
export type ReorderChecklistInput = z.infer<typeof reorderChecklistSchema>;

// -------------------------------------------------------------------- links

/**
 * Only http: and https: URLs are accepted. javascript:, data:, vbscript:, file:
 * and any other scheme are rejected before persistence.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a valid http(s) URL');

export const createLinkSchema = z.object({
  type: ticketLinkTypeSchema,
  label: z.string().trim().max(200).nullable().optional(),
  url: httpUrlSchema,
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

// ---------------------------------------------------------------- relations

export const createRelationSchema = z.object({
  type: ticketRelationTypeSchema,
  otherTicketId: z.string().min(1).max(64),
});
export type CreateRelationInput = z.infer<typeof createRelationSchema>;

// --------------------------------------------------------------------- tags

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #1f6feb')
    .nullable()
    .optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const attachTagSchema = z.object({
  tagId: z.string().min(1).max(64),
});
export type AttachTagInput = z.infer<typeof attachTagSchema>;

// ------------------------------------------------------- search and filters

export const ticketFilterParamsSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  type: ticketTypeSchema.optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  /** Orthogonal blocked condition filter: 'true' / 'false'. */
  blocked: z.enum(['true', 'false']).optional(),
  hasLimitations: z.enum(['true', 'false']).optional(),
  hasKnownIssues: z.enum(['true', 'false']).optional(),
  hasFollowUps: z.enum(['true', 'false']).optional(),
  /** Free-text search scoped to the project (display ID, title, long fields). */
  q: z.string().trim().max(200).optional(),
  /** Default hides archived; explicit 'only' shows the archive view. */
  archived: z.enum(['true', 'false', 'only']).optional(),
});
export type TicketFilterParams = z.infer<typeof ticketFilterParamsSchema>;

export const listSortFieldsSchema = z.enum([
  'ticketNumber',
  'updatedAt',
  'priority',
  'status',
]);
export type ListSortField = z.infer<typeof listSortFieldsSchema>;

export interface TicketListDto {
  tickets: TicketDto[];
  total: number;
}

// ---------------------------------------------------------------------------
// Phase 3: project insights (dashboard / focus / accomplishments)
// ---------------------------------------------------------------------------

export interface ProjectDashboardDto {
  projectId: string;
  projectKey: string;
  counts: {
    planned: number;
    inProgress: number;
    implemented: number;
    tested: number;
    deployed: number;
    /** Orthogonal condition — overlaps lifecycle counts. */
    blocked: number;
  };
  recentlyUpdated: TicketDto[];
  recentlyDeployed: TicketDto[];
  currentBlockers: TicketDto[];
}

export type FocusGroupKey =
  | 'in_progress'
  | 'blocked'
  | 'implemented_awaiting_test'
  | 'tested_awaiting_deploy';

export interface FocusGroupDto {
  key: FocusGroupKey;
  tickets: TicketDto[];
}

export interface FocusDto {
  groups: FocusGroupDto[];
}

export interface AccomplishmentsDto {
  groups: {
    key: 'today' | 'this_week' | 'this_month' | 'older';
    label: string;
    tickets: TicketDto[];
    /** DEPLOYED tickets with missing deployedAt — surfaced, never fabricated. */
    dataIssues: { ticketId: string; displayId: string; issue: string }[];
  }[];
}
