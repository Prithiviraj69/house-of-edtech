import { NextResponse } from 'next/server';
import { db } from '@/db';
import { documents, documentCollaborators, documentBlocks } from '@/db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { getAuthUser } from '@/lib/jwt';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Select documents where the user is either the owner or a registered collaborator
    const userDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: documents.ownerId,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(documentCollaborators, eq(documents.id, documentCollaborators.documentId))
      .where(
        or(
          eq(documents.ownerId, user.userId),
          eq(documentCollaborators.userId, user.userId)
        )
      )
      .orderBy(desc(documents.updatedAt));

    // De-duplicate in case of multiple join matches (though filtered by user.userId, it's safe practice)
    const uniqueDocsMap = new Map<string, typeof userDocs[0]>();
    for (const doc of userDocs) {
      uniqueDocsMap.set(doc.id, doc);
    }

    return NextResponse.json({ documents: Array.from(uniqueDocsMap.values()) });
  } catch (error) {
    console.error('Fetch documents error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const title = body.title?.trim() || 'Untitled Document';

    const newDoc = await db.transaction(async (tx) => {
      // 1. Create the document
      const [doc] = await tx
        .insert(documents)
        .values({
          title,
          ownerId: user.userId,
        })
        .returning();

      if (!doc) {
        throw new Error('Failed to create document');
      }

      // 2. Add owner to collaborators list
      await tx.insert(documentCollaborators).values({
        documentId: doc.id,
        userId: user.userId,
        role: 'owner',
      });

      // 3. Initialize with a single blank paragraph block (default order 'n')
      const initialBlockId = crypto.randomUUID();
      await tx.insert(documentBlocks).values({
        id: initialBlockId,
        documentId: doc.id,
        type: 'paragraph',
        content: '',
        order: 'n',
        version: 1,
        lastEditedBy: user.userId,
        updatedAt: new Date(),
      });

      return doc;
    });

    return NextResponse.json({ document: newDoc });
  } catch (error) {
    console.error('Create document error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
