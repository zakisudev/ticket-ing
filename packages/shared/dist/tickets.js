import { z } from 'zod';
import { TICKET_LINK_TYPES, TICKET_PRIORITIES, TICKET_RELATION_TYPES, TICKET_STATUSES, TICKET_TYPES, } from './enums.js';
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
// ---------------------------------------------------------------- checklist
export const createChecklistItemSchema = z.object({
    text: z.string().trim().min(1).max(500),
});
export const updateChecklistItemSchema = z.object({
    text: z.string().trim().min(1).max(500).optional(),
    completed: z.boolean().optional(),
});
export const reorderChecklistSchema = z.object({
    direction: z.enum(['up', 'down']),
});
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
    }
    catch {
        return false;
    }
}, 'Must be a valid http(s) URL');
export const createLinkSchema = z.object({
    type: ticketLinkTypeSchema,
    label: z.string().trim().max(200).nullable().optional(),
    url: httpUrlSchema,
});
// ---------------------------------------------------------------- relations
export const createRelationSchema = z.object({
    type: ticketRelationTypeSchema,
    otherTicketId: z.string().min(1).max(64),
});
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
export const attachTagSchema = z.object({
    tagId: z.string().min(1).max(64),
});
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
export const listSortFieldsSchema = z.enum([
    'ticketNumber',
    'updatedAt',
    'priority',
    'status',
]);
//# sourceMappingURL=tickets.js.map