import { boolean, integer, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

export const hubSchema = pgSchema('hub');

export const workspaces = hubSchema.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  cnpj: varchar('cnpj', { length: 18 }),
  phone: varchar('phone', { length: 20 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 2 }),
  logoUrl: text('logo_url'),
  active: boolean('active').notNull().default(true),
  wsmartId: varchar('wsmart_id', { length: 100 }), // sync com legado
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const feedPosts = hubSchema.table('feed_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id'), // null = rede toda
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  category: varchar('category', { length: 50 }).notNull().default('geral'), // geral | marketing | comercial | operacional | rh | produto
  title: varchar('title', { length: 255 }),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  pinned: boolean('pinned').notNull().default(false),
  requiresAck: boolean('requires_ack').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const feedAcknowledgments = hubSchema.table('feed_acknowledgments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => feedPosts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = hubSchema.table('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id'), // null = rede toda
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  fileUrl: text('file_url').notNull(),
  requiresAcceptance: boolean('requires_acceptance').notNull().default(false),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documentAcceptances = hubSchema.table('document_acceptances', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const trainingModules = hubSchema.table('training_modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id'), // null = rede toda
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  requiredRole: varchar('required_role', { length: 50 }), // null = todos
  requiredPermission: varchar('required_permission', { length: 100 }), // permissão granular
  order: integer('order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingLessons = hubSchema.table('training_lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => trainingModules.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  videoUrl: text('video_url'),
  fileUrl: text('file_url'),
  order: integer('order').notNull().default(0),
  durationMinutes: integer('duration_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingProgress = hubSchema.table('training_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => trainingLessons.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = hubSchema.table('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('info'), // info | warning | success | error
  referenceType: varchar('reference_type', { length: 50 }), // feed_post | document | training | order
  referenceId: uuid('reference_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lives = hubSchema.table('lives', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id'), // null = rede toda
  hostId: uuid('host_id')
    .notNull()
    .references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  streamUrl: text('stream_url'),
  thumbnailUrl: text('thumbnail_url'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('scheduled'), // scheduled | live | ended
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
