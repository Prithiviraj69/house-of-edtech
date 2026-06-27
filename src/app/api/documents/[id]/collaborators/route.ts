import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { db } from '@/db';
import { documents, documentCollaborators, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const addCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']),
});

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

    // Check if user is collaborator/owner
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) {
      return NextResponse.json({ error: 'Document Not Found' }, { status: 404 });
    }

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

    if (!isOwner && !collab) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all collaborators joined with user details
    const list = await db
      .select({
        id: documentCollaborators.id,
        role: documentCollaborators.role,
        email: users.email,
        name: users.name,
        userId: users.id,
      })
      .from(documentCollaborators)
      .innerJoin(users, eq(documentCollaborators.userId, users.id))
      .where(eq(documentCollaborators.documentId, documentId));

    return NextResponse.json({ collaborators: list });
  } catch (error) {
    console.error('Fetch collaborators error:', error);
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

    // Verify document exists
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) {
      return NextResponse.json({ error: 'Document Not Found' }, { status: 404 });
    }

    // Only Owner can add collaborators
    if (doc.ownerId !== user.userId) {
      return NextResponse.json({ error: 'Only the document owner can manage collaborators' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = addCollaboratorSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: validated.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { email, role } = validated.data;
    const targetEmail = email.toLowerCase().trim();

    // Query user in database
    const [targetUser] = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);
    if (!targetUser) {
      return NextResponse.json({ error: `User with email '${email}' not found` }, { status: 404 });
    }

    if (targetUser.id === user.userId) {
      return NextResponse.json({ error: 'You are already the owner of this document' }, { status: 400 });
    }

    // Add collaborator role
    const [newCollab] = await db
      .insert(documentCollaborators)
      .values({
        documentId,
        userId: targetUser.id,
        role,
      })
      .onConflictDoUpdate({
        target: [documentCollaborators.documentId, documentCollaborators.userId],
        set: { role },
      })
      .returning();

    return NextResponse.json({
      success: true,
      collaborator: {
        id: newCollab.id,
        role: newCollab.role,
        name: targetUser.name,
        email: targetUser.email,
      },
    });
  } catch (error) {
    console.error('Add collaborator error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
