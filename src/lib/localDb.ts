// Client-side IndexedDB wrapper for local-first document storage

export interface LocalDocument {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalBlock {
  id: string;
  documentId: string;
  type: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'code' | 'todo';
  content: string;
  order: string;
  version: number;
  lastEditedBy: string;
  updatedAt: string;
}

export interface SyncOperation {
  id?: number; // Auto-increment key in IndexedDB
  documentId: string;
  blockId: string;
  action: 'upsert' | 'delete';
  data?: Omit<LocalBlock, 'documentId' | 'id'>;
  timestamp: number;
}

const DB_NAME = 'EdtechCollaborativeEditorDB';
const DB_VERSION = 1;

class LocalDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.dbPromise = this.initDB();
    }
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Document Store
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }

        // Blocks Store (Indexed by documentId)
        if (!db.objectStoreNames.contains('blocks')) {
          const blockStore = db.createObjectStore('blocks', { keyPath: 'id' });
          blockStore.createIndex('documentId', 'documentId', { unique: false });
        }

        // Outbox Sync Queue (Indexed by documentId)
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('documentId', 'documentId', { unique: false });
        }

        // Key-Value Store for meta info (like local sync stamps)
        if (!db.objectStoreNames.contains('key_val')) {
          db.createObjectStore('key_val', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      throw new Error('IndexedDB is not supported or not initialized on server-side');
    }
    return this.dbPromise;
  }

  // --- Document Operations ---
  async saveDocument(doc: LocalDocument): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.put(doc);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDocument(id: string): Promise<LocalDocument | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllDocuments(): Promise<LocalDocument[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Block Operations ---
  async saveBlock(block: LocalBlock): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blocks', 'readwrite');
      const store = transaction.objectStore('blocks');
      const request = store.put(block);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveBlocks(blocks: LocalBlock[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blocks', 'readwrite');
      const store = transaction.objectStore('blocks');
      for (const block of blocks) {
        store.put(block);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getBlocksForDocument(documentId: string): Promise<LocalBlock[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blocks', 'readonly');
      const store = transaction.objectStore('blocks');
      const index = store.index('documentId');
      const request = index.getAll(IDBKeyRange.only(documentId));
      request.onsuccess = () => {
        const blocks = request.result || [];
        // Sort blocks by order fractional index
        blocks.sort((a, b) => a.order.localeCompare(b.order));
        resolve(blocks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBlock(blockId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blocks', 'readwrite');
      const store = transaction.objectStore('blocks');
      const request = store.delete(blockId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Queue (Outbox) Operations ---
  async enqueueOperation(op: SyncOperation): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.add(op);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async getQueue(documentId?: string): Promise<SyncOperation[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readonly');
      const store = transaction.objectStore('sync_queue');
      
      let request: IDBRequest<any[]>;
      if (documentId) {
        const index = store.index('documentId');
        request = index.getAll(IDBKeyRange.only(documentId));
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteQueueItems(ids: number[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      for (const id of ids) {
        store.delete(id);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Metadata Key-Value Store ---
  async setMeta(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('key_val', 'readwrite');
      const store = transaction.objectStore('key_val');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMeta<T = any>(key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('key_val', 'readonly');
      const store = transaction.objectStore('key_val');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }
}

export const localDB = new LocalDB();
