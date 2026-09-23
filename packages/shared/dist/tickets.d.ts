import { z } from 'zod';
import { type TicketActivityType, type TicketLinkType, type TicketPriority, type TicketRelationPresentationType, type TicketStatus, type TicketType } from './enums.js';
export declare const ticketStatusSchema: z.ZodEnum<{
    PLANNED: "PLANNED";
    IN_PROGRESS: "IN_PROGRESS";
    IMPLEMENTED: "IMPLEMENTED";
    TESTED: "TESTED";
    DEPLOYED: "DEPLOYED";
}>;
export declare const ticketTypeSchema: z.ZodEnum<{
    FEATURE: "FEATURE";
    BUG: "BUG";
    SECURITY: "SECURITY";
    OPS: "OPS";
    UX: "UX";
    REFACTOR: "REFACTOR";
    RESEARCH: "RESEARCH";
    DOCUMENTATION: "DOCUMENTATION";
}>;
export declare const ticketPrioritySchema: z.ZodEnum<{
    P0: "P0";
    P1: "P1";
    P2: "P2";
    P3: "P3";
}>;
export declare const ticketLinkTypeSchema: z.ZodEnum<{
    DOCUMENTATION: "DOCUMENTATION";
    COMMIT: "COMMIT";
    PULL_REQUEST: "PULL_REQUEST";
    REPOSITORY: "REPOSITORY";
    DEPLOYMENT: "DEPLOYMENT";
    ISSUE: "ISSUE";
    CHAT: "CHAT";
    OTHER: "OTHER";
}>;
export declare const ticketRelationTypeSchema: z.ZodEnum<{
    BLOCKS: "BLOCKS";
    FOLLOWS_UP: "FOLLOWS_UP";
    RELATED_TO: "RELATED_TO";
}>;
/** Quick create: title plus optional overrides; defaults applied server-side. */
export declare const createTicketSchema: z.ZodObject<{
    title: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<{
        PLANNED: "PLANNED";
        IN_PROGRESS: "IN_PROGRESS";
        IMPLEMENTED: "IMPLEMENTED";
        TESTED: "TESTED";
        DEPLOYED: "DEPLOYED";
    }>>;
    priority: z.ZodOptional<z.ZodEnum<{
        P0: "P0";
        P1: "P1";
        P2: "P2";
        P3: "P3";
    }>>;
    type: z.ZodOptional<z.ZodEnum<{
        FEATURE: "FEATURE";
        BUG: "BUG";
        SECURITY: "SECURITY";
        OPS: "OPS";
        UX: "UX";
        REFACTOR: "REFACTOR";
        RESEARCH: "RESEARCH";
        DOCUMENTATION: "DOCUMENTATION";
    }>>;
}, z.core.$strip>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
/**
 * Patch body. `version` is mandatory: the server applies the update only when it
 * matches the stored version, otherwise responds 409 STALE_UPDATE.
 */
export declare const updateTicketSchema: z.ZodObject<{
    version: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    motivation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    acceptanceCriteria: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    implementationNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    testingNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    deploymentNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    limitations: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    knownIssues: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    followUpNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sourceReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<{
        PLANNED: "PLANNED";
        IN_PROGRESS: "IN_PROGRESS";
        IMPLEMENTED: "IMPLEMENTED";
        TESTED: "TESTED";
        DEPLOYED: "DEPLOYED";
    }>>;
    priority: z.ZodOptional<z.ZodEnum<{
        P0: "P0";
        P1: "P1";
        P2: "P2";
        P3: "P3";
    }>>;
    type: z.ZodOptional<z.ZodEnum<{
        FEATURE: "FEATURE";
        BUG: "BUG";
        SECURITY: "SECURITY";
        OPS: "OPS";
        UX: "UX";
        REFACTOR: "REFACTOR";
        RESEARCH: "RESEARCH";
        DOCUMENTATION: "DOCUMENTATION";
    }>>;
    isBlocked: z.ZodOptional<z.ZodBoolean>;
    blockedReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    archived: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
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
export declare const createChecklistItemSchema: z.ZodObject<{
    text: z.ZodString;
}, z.core.$strip>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export declare const updateChecklistItemSchema: z.ZodObject<{
    text: z.ZodOptional<z.ZodString>;
    completed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export declare const reorderChecklistSchema: z.ZodObject<{
    direction: z.ZodEnum<{
        up: "up";
        down: "down";
    }>;
}, z.core.$strip>;
export type ReorderChecklistInput = z.infer<typeof reorderChecklistSchema>;
/**
 * Only http: and https: URLs are accepted. javascript:, data:, vbscript:, file:
 * and any other scheme are rejected before persistence.
 */
export declare const httpUrlSchema: z.ZodString;
export declare const createLinkSchema: z.ZodObject<{
    type: z.ZodEnum<{
        DOCUMENTATION: "DOCUMENTATION";
        COMMIT: "COMMIT";
        PULL_REQUEST: "PULL_REQUEST";
        REPOSITORY: "REPOSITORY";
        DEPLOYMENT: "DEPLOYMENT";
        ISSUE: "ISSUE";
        CHAT: "CHAT";
        OTHER: "OTHER";
    }>;
    label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    url: z.ZodString;
}, z.core.$strip>;
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export declare const createRelationSchema: z.ZodObject<{
    type: z.ZodEnum<{
        BLOCKS: "BLOCKS";
        FOLLOWS_UP: "FOLLOWS_UP";
        RELATED_TO: "RELATED_TO";
    }>;
    otherTicketId: z.ZodString;
}, z.core.$strip>;
export type CreateRelationInput = z.infer<typeof createRelationSchema>;
export declare const createTagSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export declare const attachTagSchema: z.ZodObject<{
    tagId: z.ZodString;
}, z.core.$strip>;
export type AttachTagInput = z.infer<typeof attachTagSchema>;
export declare const ticketFilterParamsSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        PLANNED: "PLANNED";
        IN_PROGRESS: "IN_PROGRESS";
        IMPLEMENTED: "IMPLEMENTED";
        TESTED: "TESTED";
        DEPLOYED: "DEPLOYED";
    }>>;
    priority: z.ZodOptional<z.ZodEnum<{
        P0: "P0";
        P1: "P1";
        P2: "P2";
        P3: "P3";
    }>>;
    type: z.ZodOptional<z.ZodEnum<{
        FEATURE: "FEATURE";
        BUG: "BUG";
        SECURITY: "SECURITY";
        OPS: "OPS";
        UX: "UX";
        REFACTOR: "REFACTOR";
        RESEARCH: "RESEARCH";
        DOCUMENTATION: "DOCUMENTATION";
    }>>;
    tag: z.ZodOptional<z.ZodString>;
    blocked: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    hasLimitations: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    hasKnownIssues: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    hasFollowUps: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
    q: z.ZodOptional<z.ZodString>;
    archived: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
        only: "only";
    }>>;
}, z.core.$strip>;
export type TicketFilterParams = z.infer<typeof ticketFilterParamsSchema>;
export declare const listSortFieldsSchema: z.ZodEnum<{
    status: "status";
    priority: "priority";
    ticketNumber: "ticketNumber";
    updatedAt: "updatedAt";
}>;
export type ListSortField = z.infer<typeof listSortFieldsSchema>;
export interface TicketListDto {
    tickets: TicketDto[];
    total: number;
}
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
export type FocusGroupKey = 'in_progress' | 'blocked' | 'implemented_awaiting_test' | 'tested_awaiting_deploy';
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
        dataIssues: {
            ticketId: string;
            displayId: string;
            issue: string;
        }[];
    }[];
}
//# sourceMappingURL=tickets.d.ts.map