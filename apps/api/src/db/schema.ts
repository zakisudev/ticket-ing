import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  unique,
  varchar,
  bigint,
} from 'drizzle-orm/mysql-core';

/**
 * Enum value arrays are declared here (drizzle-kit cannot import the ESM-only
 * shared workspace package). A test asserts parity with @zakisu-tickets/shared
 * so the DB and API contracts can never drift.
 */
export const TICKET_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTED',
  'DEPLOYED',
  'BLOCKED',
  'ARCHIVED',
] as const;
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
export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
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
export const TICKET_RELATION_TYPES = ['BLOCKS', 'FOLLOWS_UP', 'RELATED_TO'] as const;
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

/**
 * All IDs are app-generated UUIDv7 (time-ordered, CHAR(36)).
 * Display ticket IDs (TMR-042) are derived from project_key + ticket_number, never stored.
 */

export const users = mysqlTable('users', {
  id: char('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const sessions = mysqlTable(
  'sessions',
  {
    id: char('id', { length: 36 }).primaryKey(),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 hex of the opaque session token; raw token only ever lives in the cookie. */
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: datetime('expires_at', { mode: 'string' }).notNull(),
    lastUsedAt: datetime('last_used_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_sessions_user_id').on(t.userId)]
);

export const projects = mysqlTable(
  'projects',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ownerId: char('owner_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    projectKey: varchar('project_key', { length: 10 }).notNull(),
    description: text(),
    color: varchar('color', { length: 32 }),
    icon: varchar('icon', { length: 32 }),
    repositoryUrl: varchar('repository_url', { length: 1000 }),
    stagingUrl: varchar('staging_url', { length: 1000 }),
    productionUrl: varchar('production_url', { length: 1000 }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    archivedAt: datetime('archived_at', { mode: 'string' }),
  },
  (t) => [
    unique('uq_projects_owner_slug').on(t.ownerId, t.slug),
    unique('uq_projects_owner_key').on(t.ownerId, t.projectKey),
    index('idx_projects_owner_id').on(t.ownerId),
  ]
);

/** Atomic per-project ticket numbering: UPDATE ... SET last_number = LAST_INSERT_ID(last_number + 1). */
export const projectTicketCounters = mysqlTable('project_ticket_counters', {
  projectId: char('project_id', { length: 36 })
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),    lastNumber: int('last_number').notNull().default(0),
});

export const tickets = mysqlTable(
  'tickets',
  {
    id: char('id', { length: 36 }).primaryKey(),
    projectId: char('project_id', { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketNumber: int('ticket_number').notNull(),
    /** Reserved for Phase 4 historical import idempotency; never populated in Phase 1. */
    importKey: varchar('import_key', { length: 120 }),
    title: varchar('title', { length: 200 }).notNull(),
    status: mysqlEnum('status', [...TICKET_STATUSES]).notNull().default('PLANNED'),
    priority: mysqlEnum('priority', [...TICKET_PRIORITIES]).notNull().default('P2'),
    type: mysqlEnum('type', [...TICKET_TYPES]).notNull().default('FEATURE'),
    summary: varchar('summary', { length: 500 }),
    description: mediumText(),
    motivation: mediumText(),
    acceptanceCriteria: mediumText(),
    implementationNotes: mediumText(),
    testingNotes: mediumText(),
    deploymentNotes: mediumText(),
    limitations: mediumText(),
    knownIssues: mediumText(),
    followUpNotes: mediumText(),
    blockedReason: varchar('blocked_reason', { length: 500 }),
    sourceReference: varchar('source_reference', { length: 300 }),
    /** Optimistic concurrency counter; PATCH must echo it and server bumps it. */
    version: int('version').notNull().default(1),
    startedAt: datetime('started_at', { mode: 'string' }),
    implementedAt: datetime('implemented_at', { mode: 'string' }),
    testedAt: datetime('tested_at', { mode: 'string' }),
    deployedAt: datetime('deployed_at', { mode: 'string' }),
    archivedAt: datetime('archived_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    unique('uq_tickets_project_number').on(t.projectId, t.ticketNumber),
    unique('uq_tickets_project_import_key').on(t.projectId, t.importKey),
    index('idx_tickets_project_status').on(t.projectId, t.status),
    index('idx_tickets_project_updated').on(t.projectId, t.updatedAt),
    index('idx_tickets_status').on(t.status),
  ]
);

export const ticketActivities = mysqlTable(
  'ticket_activities',
  {
    id: char('id', { length: 36 }).primaryKey(),
    /** Monotonic insertion order for deterministic timelines (DATETIME has 1s granularity). */
    seq: bigint('seq', { mode: 'number' }).notNull().autoincrement().unique(),
    ticketId: char('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    actorUserId: char('actor_user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    type: mysqlEnum('type', [...TICKET_ACTIVITY_TYPES]).notNull(),
    /** Safe metadata only (field names, from/to values) — never long text or secrets. */
    metadata: json('metadata'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_ticket_activities_ticket_created').on(t.ticketId, t.createdAt)]
);

/**
 * Relations — exactly ONE canonical row per relationship; the inverse presentation
 * (e.g. B is BLOCKED_BY A) is derived at read time, never persisted.
 */
export const ticketRelations = mysqlTable(
  'ticket_relations',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ticketId: char('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    relatedTicketId: char('related_ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', [...TICKET_RELATION_TYPES]).notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    unique('uq_ticket_relations').on(t.ticketId, t.relatedTicketId, t.type),
    index('idx_ticket_relations_ticket').on(t.ticketId),
    index('idx_ticket_relations_related').on(t.relatedTicketId),
  ]
);

export const ticketChecklistItems = mysqlTable(
  'ticket_checklist_items',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ticketId: char('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 500 }).notNull(),
    completed: boolean('completed').notNull().default(false),
    sortOrder: int('sort_order').notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: datetime('completed_at', { mode: 'string' }),
  },
  (t) => [index('idx_checklist_ticket_sort').on(t.ticketId, t.sortOrder)]
);

export const ticketLinks = mysqlTable(
  'ticket_links',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ticketId: char('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', [...TICKET_LINK_TYPES]).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    url: varchar('url', { length: 1000 }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_ticket_links_ticket').on(t.ticketId)]
);

export const tags = mysqlTable(
  'tags',
  {
    id: char('id', { length: 36 }).primaryKey(),
    ownerId: char('owner_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 32 }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique('uq_tags_owner_name').on(t.ownerId, t.name)]
);

export const ticketTags = mysqlTable(
  'ticket_tags',
  {
    ticketId: char('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    tagId: char('tag_id', { length: 36 })
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.tagId] }), index('idx_ticket_tags_tag').on(t.tagId)]
);

function mediumText() {
  return text();
}
