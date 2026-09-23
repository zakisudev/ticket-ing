/** Ticket workflow states. IMPLEMENTED/TESTED/DEPLOYED are deliberately distinct. */
export const TICKET_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTED',
  'DEPLOYED',
  'BLOCKED',
  'ARCHIVED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Workflow columns shown on the Kanban board (order matters). */
export const BOARD_COLUMN_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTED',
  'DEPLOYED',
] as const satisfies readonly TicketStatus[];

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

/** Relation types — exactly one canonical row is persisted; inverse is derived. */
export const TICKET_RELATION_TYPES = ['BLOCKS', 'FOLLOWS_UP', 'RELATED_TO'] as const;
export type TicketRelationType = (typeof TICKET_RELATION_TYPES)[number];

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
