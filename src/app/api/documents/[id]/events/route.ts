import { getAuthUser } from '@/lib/jwt';
import { db } from '@/db';
import { documentCollaborators, documents } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { sseBroker } from '@/lib/sseBroker';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const user = await getAuthUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    if (!clientId) {
      return new Response('Missing clientId', { status: 400 });
    }

    // Verify document exists
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) {
      return new Response('Document Not Found', { status: 404 });
    }

    // Verify collaborator/owner status
    const isOwner = doc.ownerId === user.userId;
    const collabs = await db
      .select()
      .from(documentCollaborators)
      .where(
        and(
          eq(documentCollaborators.documentId, documentId),
          eq(documentCollaborators.userId, user.userId)
        )
      )
      .limit(1);

    if (!isOwner && collabs.length === 0) {
      return new Response('Forbidden', { status: 403 });
    }

    const stream = new ReadableStream({
      start(controller) {
        // Enqueue connection handshake
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
        
        sseBroker.register(documentId, clientId, controller);
      },
      cancel() {
        sseBroker.unregister(documentId, clientId);
      },
    });

    request.signal.addEventListener('abort', () => {
      sseBroker.unregister(documentId, clientId);
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('SSE Stream initialization error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
