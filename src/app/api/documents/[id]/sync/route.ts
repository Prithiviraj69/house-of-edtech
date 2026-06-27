import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { db } from '@/db';
import { documentCollaborators, documents, documentBlocks, syncTombstones } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { resolveSyncOperations } from '@/lib/conflictResolver';
import { sseBroker } from '@/lib/sseBroker';

// Strict validation schemas to prevent malicious/bloated payloads (mitigates OOM)
const syncBlockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['paragraph', 'heading-1', 'heading-2', 'heading-3', 'code', 'todo']),
  content: z.string().max(100000, 'Block content too large'), // limit block to 100KB
  order: z.string().max(255),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  baseContent: z.string().max(100000).optional(),
});

const syncOperationSchema = z.object({
  blockId: z.string().uuid(),
  action: z.enum(['upsert', 'delete']),
  blockData: syncBlockSchema.optional(),
});

const syncPayloadSchema = z.object({
  clientId: z.string().min(1),
  operations: z.array(syncOperationSchema).max(200, 'Too many operations in a single sync'), // Limit bulk operations size
  title: z.string().max(255).optional(),
});

async function getUserRole(documentId: string, userId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return null;

  if (doc.ownerId === userId) return 'owner';

  const [collab] = await db
    .select()
    .from(documentCollaborators)
    .where(
      and(
        eq(documentCollaborators.documentId, documentId),
        eq(documentCollaborators.userId, userId)
      )
    )
    .limit(1);

  if (collab) {
    return collab.role as 'owner' | 'editor' | 'viewer';
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(documentId, user.userId);
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the document details to retrieve the title
    const [doc] = await db
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    // Fetch all active blocks for this document
    const blocks = await db
      .select()
      .from(documentBlocks)
      .where(eq(documentBlocks.documentId, documentId));
    
    // Sort blocks by fractional index order
    blocks.sort((a, b) => a.order.localeCompare(b.order));

    // Fetch deleted block tombstones
    const tombstones = await db
      .select()
      .from(syncTombstones)
      .where(eq(syncTombstones.documentId, documentId));

    return NextResponse.json({
      title: doc?.title || 'Untitled Document',
      blocks: blocks.map((b) => ({
        id: b.id,
        type: b.type,
        content: b.content,
        order: b.order,
        version: b.version,
        lastEditedBy: b.lastEditedBy,
        updatedAt: b.updatedAt.toISOString(),
      })),
      deletedBlockIds: tombstones.map((t) => t.id),
      role,
    });
  } catch (error) {
    console.error('GET sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(documentId, user.userId);
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Enforce role-based access rules: Viewers are read-only and cannot sync
    if (role === 'viewer') {
      return NextResponse.json(
        { error: 'Viewer role is read-only. Cannot synchronize local modifications.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validated = syncPayloadSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message || 'Invalid sync payload' },
        { status: 400 }
      );
    }

    const { clientId, operations, title } = validated.data;

    // Resolve synchronization edits in a database transaction
    const syncResult = await resolveSyncOperations(documentId, user.userId, operations);

    // If title is provided, update it in the database
    if (title) {
      await db
        .update(documents)
        .set({ title, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
    }

    // If there were modifications or title updates, broadcast the updates to all other active editors
    if (syncResult.mergedBlocks.length > 0 || syncResult.deletedBlockIds.length > 0 || title) {
      sseBroker.broadcast(documentId, clientId, {
        clientId,
        mergedBlocks: syncResult.mergedBlocks.map((b) => ({
          id: b.id,
          type: b.type,
          content: b.content,
          order: b.order,
          version: b.version,
          lastEditedBy: b.lastEditedBy,
          updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : b.updatedAt.toISOString(),
        })),
        deletedBlockIds: syncResult.deletedBlockIds,
        title,
        userId: user.userId,
        userName: user.name,
      });
    }

    return NextResponse.json({
      success: true,
      clientUpdates: syncResult.clientUpdates,
    });
  } catch (error) {
    console.error('POST sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
