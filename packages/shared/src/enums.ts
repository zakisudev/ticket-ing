/**
 * Ticket lifecycle states — answer "how far has this work progressed?".
 *
 * PRODUCT INVARIANT: BLOCKED and ARCHIVED are NOT lifecycle states.
 * - Blocked is an orthogonal condition: tickets.isBlocked + blockedReason.
 * - Archived is an orthogonal condition: tickets.archivedAt != null.
 * A blocked ticket keeps its lifecycle status and stays in its board column.
 */
export const TICKET_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTED',
  'DEPLOYED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Workflow columns shown on the Kanban board (order matters) — identical to lifecycle. */
export const BOARD_COLUMN_STATUSES = TICKET_STATUSES;

export const TICKET_TYPES = [
  'FEATURE',
  'BUG',
  'SECURITY',
  'OPS',
  'UX',
  'REFACTOR',
  'RESEARCH',
  'DOCUMENTATION',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Link types reserved for Phase 2 (schema exists from day one). */
export const TICKET_LINK_TYPES = [
  'COMMIT',
  'PULL_REQUEST',
  'REPOSITORY',
  'DEPLOYMENT',
  'DOCUMENTATION',
  'ISSUE',
  'CHAT',
  'OTHER',
] as const;
export type TicketLinkType = (typeof TICKET_LINK_TYPES)[number];

/** Relation concepts — exactly one canonical row is persisted; the inverse presentation is derived at read time. BLOCKED_BY is never stored. */
export const TICKET_RELATION_TYPES = ['BLOCKS', 'FOLLOWS_UP', 'RELATED_TO'] as const;
export type TicketRelationType = (typeof TICKET_RELATION_TYPES)[number];

/** Presentation types include derived inverses (never persisted). */
export const TICKET_RELATION_PRESENTATION_TYPES = [
  'BLOCKS',
  'BLOCKED_BY',
  'FOLLOWS_UP',
  'FOLLOWED_UP_BY',
  'RELATED_TO',
] as const;
export type TicketRelationPresentationType = (typeof TICKET_RELATION_PRESENTATION_TYPES)[number];

/** Ticket activity types recorded from Phase 1 onward. */
export const TICKET_ACTIVITY_TYPES = [
  'TICKET_CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'TYPE_CHANGED',
  'TITLE_CHANGED',
  'FIELDS_UPDATED',
  'BLOCKED',
  'UNBLOCKED',
  'TICKET_ARCHIVED',
  'TICKET_RESTORED',
  'CHECKLIST_ITEM_ADDED',
  'CHECKLIST_ITEM_COMPLETED',
  'CHECKLIST_ITEM_REOPENED',
  'CHECKLIST_ITEM_REMOVED',
  'LINK_ADDED',
  'LINK_REMOVED',
  'RELATION_ADDED',
  'RELATION_REMOVED',
  'TAG_ADDED',
  'TAG_REMOVED',
] as const;
export type TicketActivityType = (typeof TICKET_ACTIVITY_TYPES)[number];

/** Structured API error codes. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'CONFLICT',
  'STALE_UPDATE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
