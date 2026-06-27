import { pgTable, uuid, varchar, text, integer, timestamp, unique, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentCollaborators = pgTable('document_collaborators', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // 'owner' | 'editor' | 'viewer'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique('doc_user_unique').on(t.documentId, t.userId)
]);

export const documentBlocks = pgTable('document_blocks', {
  id: varchar('id', { length: 255 }).primaryKey(), // Client-generated UUID string
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'code' | 'todo'
  content: text('content').notNull(),
  order: varchar('order', { length: 255 }).notNull(), // Fractional index sorting string
  version: integer('version').notNull().default(1),
  lastEditedBy: uuid('last_edited_by').references(() => users.id).notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const documentSnapshots = pgTable('document_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  blocksState: jsonb('blocks_state').notNull(), // Snapshot of all blocks at this point in time
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const syncTombstones = pgTable('sync_tombstones', {
  id: varchar('id', { length: 255 }).primaryKey(), // Client-deleted block ID
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  deletedAt: timestamp('deleted_at').defaultNow().notNull(),
});
