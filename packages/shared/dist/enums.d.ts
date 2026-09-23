/**
 * Ticket lifecycle states — answer "how far has this work progressed?".
 *
 * PRODUCT INVARIANT: BLOCKED and ARCHIVED are NOT lifecycle states.
 * - Blocked is an orthogonal condition: tickets.isBlocked + blockedReason.
 * - Archived is an orthogonal condition: tickets.archivedAt != null.
 * A blocked ticket keeps its lifecycle status and stays in its board column.
 */
export declare const TICKET_STATUSES: readonly ["PLANNED", "IN_PROGRESS", "IMPLEMENTED", "TESTED", "DEPLOYED"];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** Workflow columns shown on the Kanban board (order matters) — identical to lifecycle. */
export declare const BOARD_COLUMN_STATUSES: readonly ["PLANNED", "IN_PROGRESS", "IMPLEMENTED", "TESTED", "DEPLOYED"];
export declare const TICKET_TYPES: readonly ["FEATURE", "BUG", "SECURITY", "OPS", "UX", "REFACTOR", "RESEARCH", "DOCUMENTATION"];
export type TicketType = (typeof TICKET_TYPES)[number];
export declare const TICKET_PRIORITIES: readonly ["P0", "P1", "P2", "P3"];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
/** Link types reserved for Phase 2 (schema exists from day one). */
export declare const TICKET_LINK_TYPES: readonly ["COMMIT", "PULL_REQUEST", "REPOSITORY", "DEPLOYMENT", "DOCUMENTATION", "ISSUE", "CHAT", "OTHER"];
export type TicketLinkType = (typeof TICKET_LINK_TYPES)[number];
/** Relation concepts — exactly one canonical row is persisted; the inverse presentation is derived at read time. BLOCKED_BY is never stored. */
export declare const TICKET_RELATION_TYPES: readonly ["BLOCKS", "FOLLOWS_UP", "RELATED_TO"];
export type TicketRelationType = (typeof TICKET_RELATION_TYPES)[number];
/** Presentation types include derived inverses (never persisted). */
export declare const TICKET_RELATION_PRESENTATION_TYPES: readonly ["BLOCKS", "BLOCKED_BY", "FOLLOWS_UP", "FOLLOWED_UP_BY", "RELATED_TO"];
export type TicketRelationPresentationType = (typeof TICKET_RELATION_PRESENTATION_TYPES)[number];
/** Ticket activity types recorded from Phase 1 onward. */
export declare const TICKET_ACTIVITY_TYPES: readonly ["TICKET_CREATED", "STATUS_CHANGED", "PRIORITY_CHANGED", "TYPE_CHANGED", "TITLE_CHANGED", "FIELDS_UPDATED", "BLOCKED", "UNBLOCKED", "TICKET_ARCHIVED", "TICKET_RESTORED", "CHECKLIST_ITEM_ADDED", "CHECKLIST_ITEM_COMPLETED", "CHECKLIST_ITEM_REOPENED", "CHECKLIST_ITEM_REMOVED", "LINK_ADDED", "LINK_REMOVED", "RELATION_ADDED", "RELATION_REMOVED", "TAG_ADDED", "TAG_REMOVED"];
export type TicketActivityType = (typeof TICKET_ACTIVITY_TYPES)[number];
/** Structured API error codes. */
export declare const ERROR_CODES: readonly ["VALIDATION_ERROR", "UNAUTHENTICATED", "NOT_FOUND", "CONFLICT", "STALE_UPDATE", "RATE_LIMITED", "INTERNAL_ERROR"];
export type ErrorCode = (typeof ERROR_CODES)[number];
//# sourceMappingURL=enums.d.ts.map