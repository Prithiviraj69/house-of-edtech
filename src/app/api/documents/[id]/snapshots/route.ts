import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { db } from '@/db';
import { documents, documentCollaborators, documentBlocks, documentSnapshots, users, syncTombstones } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sseBroker } from '@/lib/sseBroker';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Validate access permissions
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return NextResponse.json({ error: 'Document Not Found' }, { status: 404 });

    const isOwner = doc.ownerId === user.userId;
    const [collab] = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.documentId, documentId),
          eq(documentCollaborators.userId, user.userId)
        )
      )
      .limit(1);

    if (!isOwner && !collab) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Fetch snapshots joined with their creator's name
    const snapshotsList = await db
      .select({
        id: documentSnapshots.id,
        title: documentSnapshots.title,
        createdAt: documentSnapshots.createdAt,
        createdByName: users.name,
      })
      .from(documentSnapshots)
      .innerJoin(users, eq(documentSnapshots.createdBy, users.id))
      .where(eq(documentSnapshots.documentId, documentId))
      .orderBy(desc(documentSnapshots.createdAt));

    return NextResponse.json({ snapshots: snapshotsList });
  } catch (error) {
    console.error('Fetch snapshots error:', error);
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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return NextResponse.json({ error: 'Document Not Found' }, { status: 404 });

    // Only Owner and Editors can create snapshots
    const isOwner = doc.ownerId === user.userId;
    const [collab] = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.documentId, documentId),
          eq(documentCollaborators.userId, user.userId)
        )
      )
      .limit(1);

    const canEdit = isOwner || (collab && (collab.role === 'owner' || collab.role === 'editor'));
    if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const title = body.title?.trim() || `Snapshot - ${new Date().toLocaleString()}`;

    // Query current active document blocks to snap
    const currentBlocks = await db
      .select()
      .from(documentBlocks)
      .where(eq(documentBlocks.documentId, documentId));

    const blocksJson = currentBlocks.map((b) => ({
      id: b.id,
      type: b.type,
      content: b.content,
      order: b.order,
      version: b.version,
    }));

    const [newSnapshot] = await db
      .insert(documentSnapshots)
      .values({
        documentId,
        title,
        blocksState: blocksJson,
        createdBy: user.userId,
      })
      .returning();

    return NextResponse.json({ snapshot: newSnapshot });
  } catch (error) {
    console.error('Create snapshot error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) return NextResponse.json({ error: 'Document Not Found' }, { status: 404 });

    // Only Owner and Editor can restore snapshots
    const isOwner = doc.ownerId === user.userId;
    const [collab] = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.documentId, documentId),
          eq(documentCollaborators.userId, user.userId)
        )
      )
      .limit(1);

    const canEdit = isOwner || (collab && (collab.role === 'owner' || collab.role === 'editor'));
    if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { snapshotId, clientId } = body;
    if (!snapshotId) {
      return NextResponse.json({ error: 'Missing snapshotId' }, { status: 400 });
    }

    const [snapshot] = await db
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.id, snapshotId),
          eq(documentSnapshots.documentId, documentId)
        )
      )
      .limit(1);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot Not Found' }, { status: 404 });
    }

    const snapshotBlocks = snapshot.blocksState as Array<{
      id: string;
      type: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'code' | 'todo';
      content: string;
      order: string;
      version: number;
    }>;

    // Run snap-reconciliation in a single atomic transaction
    const restoredBlocks = await db.transaction(async (tx) => {
      const currentBlocks = await tx
        .select()
        .from(documentBlocks)
        .where(eq(documentBlocks.documentId, documentId));

      const currentBlockIds = new Set(currentBlocks.map((b) => b.id));
      const restoredBlockIds = new Set(snapshotBlocks.map((b) => b.id));

      // 1. Delete blocks in DB that do not exist in the snapshot (tombstoning them)
      const deletedIds: string[] = [];
      for (const id of currentBlockIds) {
        if (!restoredBlockIds.has(id)) {
          deletedIds.push(id);
          await tx.delete(documentBlocks).where(eq(documentBlocks.id, id));
          
          await tx.insert(syncTombstones).values({
            id,
            documentId,
            deletedAt: new Date()
          }).onConflictDoNothing();
        }
      }

      // 2. Re-insert or update blocks from snapshot (increment version index)
      const merged: any[] = [];
      for (const snapBlock of snapshotBlocks) {
        const dbBlock = currentBlocks.find((b) => b.id === snapBlock.id);
        const nextVersion = dbBlock ? Math.max(dbBlock.version, snapBlock.version) + 1 : snapBlock.version + 1;

        const newBlock = {
          id: snapBlock.id,
          documentId,
          type: snapBlock.type,
          content: snapBlock.content,
          order: snapBlock.order,
          version: nextVersion,
          lastEditedBy: user.userId,
          updatedAt: new Date(),
        };

        if (dbBlock) {
          await tx.update(documentBlocks).set(newBlock).where(eq(documentBlocks.id, snapBlock.id));
        } else {
          // If was deleted in DB previously, clear tombstone and insert
          await tx.delete(syncTombstones).where(eq(syncTombstones.id, snapBlock.id));
          await tx.insert(documentBlocks).values(newBlock);
        }
        merged.push(newBlock);
      }

      return { merged, deletedIds };
    });

    // Broadcast snapshot restoration diffs via SSE to align other active clients
    sseBroker.broadcast(documentId, clientId || 'server-restore', {
      clientId: clientId || 'server-restore',
      mergedBlocks: restoredBlocks.merged.map((b) => ({
        id: b.id,
        type: b.type,
        content: b.content,
        order: b.order,
        version: b.version,
        lastEditedBy: b.lastEditedBy,
        updatedAt: b.updatedAt.toISOString(),
      })),
      deletedBlockIds: restoredBlocks.deletedIds,
      userId: user.userId,
      userName: user.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Restore snapshot error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
