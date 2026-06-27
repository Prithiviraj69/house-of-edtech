// In-memory Server-Sent Events (SSE) broker for real-time collaboration updates

export interface SseUpdatePayload {
  clientId: string;
  mergedBlocks: any[];
  deletedBlockIds: string[];
  userId: string;
  userName: string;
  title?: string;
}

class SseBroker {
  // Maps documentId -> Set of active client stream controllers
  private clients = new Map<string, Set<{ clientId: string; controller: ReadableStreamDefaultController }>>();

  register(documentId: string, clientId: string, controller: ReadableStreamDefaultController) {
    if (!this.clients.has(documentId)) {
      this.clients.set(documentId, new Set());
    }
    const clientSet = this.clients.get(documentId)!;
    
    // Remove existing registration for this client ID to avoid duplicates
    for (const client of clientSet) {
      if (client.clientId === clientId) {
        clientSet.delete(client);
      }
    }
    
    clientSet.add({ clientId, controller });
  }

  unregister(documentId: string, clientId: string) {
    const clientSet = this.clients.get(documentId);
    if (!clientSet) return;

    for (const client of clientSet) {
      if (client.clientId === clientId) {
        clientSet.delete(client);
        break;
      }
    }

    if (clientSet.size === 0) {
      this.clients.delete(documentId);
    }
  }

  broadcast(documentId: string, senderClientId: string, update: SseUpdatePayload) {
    const clientSet = this.clients.get(documentId);
    if (!clientSet) return;

    const payload = JSON.stringify(update);
    const message = `data: ${payload}\n\n`;
    const encoder = new TextEncoder();

    for (const client of clientSet) {
      // Avoid sending updates back to the client that originated them
      if (client.clientId === senderClientId) continue;

      try {
        client.controller.enqueue(encoder.encode(message));
      } catch (error) {
        // Controller is closed or errored, remove it
        clientSet.delete(client);
      }
    }
  }
}

// Persist the broker instance in dev mode during hot-reloads
const globalForSse = global as unknown as { sseBroker: SseBroker };
export const sseBroker = globalForSse.sseBroker || new SseBroker();
if (process.env.NODE_ENV !== 'production') globalForSse.sseBroker = sseBroker;
