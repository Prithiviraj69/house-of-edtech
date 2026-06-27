import { localDB, SyncOperation, LocalBlock } from './localDb';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'saved' | 'error';

class SyncEngine {
  private documentId: string | null = null;
  private clientId: string = '';
  private status: SyncStatus = 'online';
  private sseSource: EventSource | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isProcessingQueue = false;

  // Listeners for UI state updates
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private blocksListeners = new Set<(blocks: LocalBlock[]) => void>();
  private collaboratorListeners = new Set<(users: { userId: string; name: string }[]) => void>();
  private titleListeners = new Set<(title: string) => void>();

  // In-memory cache of current online collaborators
  private activeCollaborators = new Map<string, { name: string; lastSeen: number }>();

  init(documentId: string) {
    if (typeof window === 'undefined') return;

    // If switching documents, clean up old listeners
    if (this.documentId !== documentId) {
      this.cleanup();
      this.documentId = documentId;
      
      // Generate a unique client session ID to distinguish browser tabs
      this.clientId = crypto.randomUUID();
    }

    this.checkConnection();
    this.startSSE();
    this.startQueueWorker();

    // Browser network events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Initial load from local IndexedDB first (Zero Network Block UI)
    this.triggerBlocksLoad();
  }

  cleanup() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.statusListeners.clear();
    this.blocksListeners.clear();
    this.collaboratorListeners.clear();
    this.titleListeners.clear();
    this.activeCollaborators.clear();
    this.isProcessingQueue = false;
  }

  // --- Subscriptions ---
  subscribeStatus(listener: (status: SyncStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => { this.statusListeners.delete(listener); };
  }

  subscribeBlocks(listener: (blocks: LocalBlock[]) => void) {
    this.blocksListeners.add(listener);
    this.triggerBlocksLoad();
    return () => { this.blocksListeners.delete(listener); };
  }

  subscribeCollaborators(listener: (users: { userId: string; name: string }[]) => void) {
    this.collaboratorListeners.add(listener);
    this.triggerCollaboratorUpdate();
    return () => { this.collaboratorListeners.delete(listener); };
  }

  subscribeTitle(listener: (title: string) => void) {
    this.titleListeners.add(listener);
    return () => { this.titleListeners.delete(listener); };
  }

  private triggerTitleUpdate(title: string) {
    this.titleListeners.forEach((l) => l(title));
  }

  private updateStatus(newStatus: SyncStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((l) => l(newStatus));
  }

  private async triggerBlocksLoad() {
    if (!this.documentId) return;
    const blocks = await localDB.getBlocksForDocument(this.documentId);
    this.blocksListeners.forEach((l) => l(blocks));
  }

  private triggerCollaboratorUpdate() {
    const list = Array.from(this.activeCollaborators.entries()).map(([userId, val]) => ({
      userId,
      name: val.name,
    }));
    this.collaboratorListeners.forEach((l) => l(list));
  }

  // --- Network Connection Helpers ---
  private handleOnline = () => {
    this.checkConnection();
    this.startSSE();
    this.processOutbox();
  };

  private handleOffline = () => {
    this.updateStatus('offline');
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
  };

  private async checkConnection() {
    // Check if the user manually toggled simulated offline mode in the application
    const isSimulatedOffline = await localDB.getMeta<boolean>('simulated_offline');
    if (isSimulatedOffline) {
      this.updateStatus('offline');
      if (this.sseSource) {
        this.sseSource.close();
        this.sseSource = null;
      }
      return;
    }

    if (navigator.onLine) {
      if (this.status === 'offline' || this.status === 'error') {
        this.updateStatus('online');
      }
    } else {
      this.updateStatus('offline');
    }
  }

  async toggleSimulatedOffline(offline: boolean) {
    await localDB.setMeta('simulated_offline', offline);
    if (offline) {
      this.handleOffline();
    } else {
      this.handleOnline();
    }
  }

  // --- Sync Engine Processing Loop ---
  private startQueueWorker() {
    // Poll the outbox queue every 2 seconds to push local changes to the server
    this.syncTimer = setInterval(() => {
      this.processOutbox();
      this.cleanupStaleCollaborators();
    }, 2000);
  }

  private cleanupStaleCollaborators() {
    const now = Date.now();
    let changed = false;
    for (const [userId, val] of this.activeCollaborators.entries()) {
      if (now - val.lastSeen > 10000) { // 10s timeout
        this.activeCollaborators.delete(userId);
        changed = true;
      }
    }
    if (changed) this.triggerCollaboratorUpdate();
  }

  /**
   * Pushes all pending operations in local IndexedDB outbox to the PostgreSQL server.
   */
  async processOutbox() {
    if (!this.documentId || this.isProcessingQueue) return;
    
    // Safety check connection status
    await this.checkConnection();
    if (this.status === 'offline') return;

    const queue = await localDB.getQueue(this.documentId);
    if (queue.length === 0) {
      if (this.status === 'syncing') {
        this.updateStatus('saved');
      }
      return;
    }

    this.isProcessingQueue = true;
    this.updateStatus('syncing');

    try {
      // Package queue items for batch POST sync
      const operations = queue.map((q) => ({
        blockId: q.blockId,
        action: q.action,
        blockData: q.data ? {
          id: q.blockId,
          ...q.data
        } : undefined
      }));

      const res = await fetch(`/api/documents/${this.documentId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          operations,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sync API responded with status ${res.status}`);
      }

      const data = await res.json();

      // Process server conflict resolution instructions
      if (data.clientUpdates && data.clientUpdates.length > 0) {
        for (const update of data.clientUpdates) {
          if (update.action === 'delete') {
            await localDB.deleteBlock(update.blockId);
          } else if (update.action === 'upsert' && update.data) {
            await localDB.saveBlock({
              id: update.blockId,
              documentId: this.documentId,
              ...update.data
            });
          }
        }
        this.triggerBlocksLoad();
      }

      // Remove successful items from local outbox queue
      const queueIds = queue.map((q) => q.id!).filter((id): id is number => id !== undefined);
      await localDB.deleteQueueItems(queueIds);

      this.updateStatus('saved');
    } catch (error) {
      console.error('Queue synchronization failure:', error);
      this.updateStatus('error');
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // --- Server-Sent Events Listener (SSE Pull Channel) ---
  private startSSE() {
    if (typeof window === 'undefined' || !this.documentId || this.sseSource) return;

    localDB.getMeta<boolean>('simulated_offline').then((isSimulated) => {
      if (isSimulated || !navigator.onLine) return;

      const url = `/api/documents/${this.documentId}/events?clientId=${this.clientId}`;
      this.sseSource = new EventSource(url);

      this.sseSource.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { clientId, mergedBlocks, deletedBlockIds, userId, userName, title } = payload;

          // Record active collaborator heartbeat
          if (userId && userName) {
            this.activeCollaborators.set(userId, { name: userName, lastSeen: Date.now() });
            this.triggerCollaboratorUpdate();
          }

          if (title) {
            this.triggerTitleUpdate(title);
          }

          if (clientId === this.clientId) return; // Ignore own broadcasts

          let stateModified = false;

          // Process remote deletions
          if (deletedBlockIds && deletedBlockIds.length > 0) {
            for (const id of deletedBlockIds) {
              await localDB.deleteBlock(id);
            }
            stateModified = true;
          }

          // Process remote modifications
          if (mergedBlocks && mergedBlocks.length > 0) {
            for (const block of mergedBlocks) {
              await localDB.saveBlock({
                id: block.id,
                documentId: this.documentId!,
                type: block.type,
                content: block.content,
                order: block.order,
                version: block.version,
                lastEditedBy: block.lastEditedBy,
                updatedAt: block.updatedAt,
              });
            }
            stateModified = true;
          }

          if (stateModified) {
            this.triggerBlocksLoad();
          }
        } catch (error) {
          console.error('Error handling collaborative push SSE event:', error);
        }
      };

      this.sseSource.addEventListener('connected', () => {
        if (this.status === 'offline') {
          this.updateStatus('online');
        }
      });

      this.sseSource.onerror = (err) => {
        console.warn('Collaboration SSE connection dropped. Reconnecting...', err);
        if (this.sseSource) {
          this.sseSource.close();
          this.sseSource = null;
        }
        // Retries automatically through system callbacks
      };
    });
  }

  // --- Client API helper for Local Edits (Zero Network UI Blocking) ---
  async handleLocalBlockUpsert(block: Omit<LocalBlock, 'documentId'>) {
    if (!this.documentId) return;

    // 1. Immediately persist to local database store to update client UI instantly
    const localBlock: LocalBlock = {
      ...block,
      documentId: this.documentId,
    };
    await localDB.saveBlock(localBlock);
    this.triggerBlocksLoad();

    // 2. Add mutation change to offline outbox queue to sync in the background
    await localDB.enqueueOperation({
      documentId: this.documentId,
      blockId: block.id,
      action: 'upsert',
      data: {
        type: block.type,
        content: block.content,
        order: block.order,
        version: block.version,
        lastEditedBy: block.lastEditedBy,
        updatedAt: block.updatedAt,
      },
      timestamp: Date.now(),
    });

    // Proactively request synchronization dispatch
    this.processOutbox();
  }

  async handleLocalBlockDelete(blockId: string) {
    if (!this.documentId) return;

    // 1. Immediately remove from local database store
    await localDB.deleteBlock(blockId);
    this.triggerBlocksLoad();

    // 2. Add deletion request to offline outbox queue
    await localDB.enqueueOperation({
      documentId: this.documentId,
      blockId,
      action: 'delete',
      timestamp: Date.now(),
    });

    // Dispatch background sync
    this.processOutbox();
  }

  /**
   * Forces complete state reconciliation from Server DB.
   * Useful when opening the document or toggling online.
   */
  async forceReconcileFromServer() {
    if (!this.documentId) return;
    await this.checkConnection();
    if (this.status === 'offline') return;

    try {
      const res = await fetch(`/api/documents/${this.documentId}/sync`);
      if (!res.ok) return;

      const data = await res.json();
      const { blocks, deletedBlockIds } = data;

      // Wipe and replace local database copy
      if (deletedBlockIds && deletedBlockIds.length > 0) {
        for (const id of deletedBlockIds) {
          await localDB.deleteBlock(id);
        }
      }

      if (blocks && blocks.length > 0) {
        const localBlocks: LocalBlock[] = blocks.map((b: any) => ({
          id: b.id,
          documentId: this.documentId!,
          type: b.type,
          content: b.content,
          order: b.order,
          version: b.version,
          lastEditedBy: b.lastEditedBy,
          updatedAt: b.updatedAt,
        }));
        await localDB.saveBlocks(localBlocks);
      }

      this.triggerBlocksLoad();
    } catch (error) {
      console.error('Failed to force sync from server:', error);
    }
  }
}

export const syncEngine = new SyncEngine();
