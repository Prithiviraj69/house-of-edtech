import { db } from '../db';
import { documentBlocks, syncTombstones } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface SyncPayloadBlock {
  id: string;
  type: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'code' | 'todo';
  content: string;
  order: string;
  version: number;
  updatedAt: string;
  baseContent?: string; // The content of this block when the client started editing it
}

export interface SyncOperationPayload {
  blockId: string;
  action: 'upsert' | 'delete';
  blockData?: SyncPayloadBlock;
}

export interface SyncResponse {
  mergedBlocks: any[]; // Blocks that were successfully merged/updated
  deletedBlockIds: string[]; // Blocks that were deleted
  clientUpdates: any[]; // Updates the client needs to apply locally (due to remote wins or merges)
}

/**
 * Splits a string into words and non-word characters for fine-grained diffing.
 */
function tokenize(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]+/g) || [];
}

/**
 * Computes the Longest Common Subsequence of two string arrays.
 */
function getLCS(x: string[], y: string[]): string[] {
  const dp: number[][] = Array(x.length + 1)
    .fill(null)
    .map(() => Array(y.length + 1).fill(0));

  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = x.length, j = y.length;
  while (i > 0 && j > 0) {
    if (x[i - 1] === y[j - 1]) {
      result.unshift(x[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/**
 * Deterministic Word-level LCS Anchor-aligned 3-Way Merge.
 * Merges modifications made in `local` and `remote` relative to `base`.
 */
export function diff3Merge(base: string, local: string, remote: string): string {
  if (local === remote) return local;
  if (base === local) return remote;
  if (base === remote) return local;

  const baseTokens = tokenize(base);
  const localTokens = tokenize(local);
  const remoteTokens = tokenize(remote);

  // Find common anchors of all three by intersecting LCS(Base, Local) and Remote
  const lcsBaseLocal = getLCS(baseTokens, localTokens);
  const anchors = getLCS(lcsBaseLocal, remoteTokens);

  const result: string[] = [];
  let b = 0, l = 0, r = 0;

  for (const anchor of anchors) {
    // Find index of anchor in each token array
    const bNext = baseTokens.indexOf(anchor, b);
    const lNext = localTokens.indexOf(anchor, l);
    const rNext = remoteTokens.indexOf(anchor, r);

    // Extract sub-segments between previous pointer and anchor
    const bSub = baseTokens.slice(b, bNext);
    const lSub = localTokens.slice(l, lNext);
    const rSub = remoteTokens.slice(r, rNext);

    // Merge sub-segments
    const bStr = bSub.join('');
    const lStr = lSub.join('');
    const rStr = rSub.join('');

    if (lStr === bStr) {
      // Local is unchanged, accept remote changes
      result.push(rStr);
    } else if (rStr === bStr) {
      // Remote is unchanged, accept local changes
      result.push(lStr);
    } else {
      // Conflict: Both modified. Concat them or resolve (here we keep both, LWW)
      result.push(lStr);
      if (lStr && rStr && !lStr.endsWith(' ') && !rStr.startsWith(' ')) {
        result.push(' ');
      }
      result.push(rStr);
    }

    // Push the anchor token itself
    result.push(anchor);

    // Advance pointers past the anchor
    b = bNext + 1;
    l = lNext + 1;
    r = rNext + 1;
  }

  // Merge remaining tokens after the last anchor
  const bSub = baseTokens.slice(b);
  const lSub = localTokens.slice(l);
  const rSub = remoteTokens.slice(r);

  const bStr = bSub.join('');
  const lStr = lSub.join('');
  const rStr = rSub.join('');

  if (lStr === bStr) {
    result.push(rStr);
  } else if (rStr === bStr) {
    result.push(lStr);
  } else {
    result.push(lStr);
    if (lStr && rStr && !lStr.endsWith(' ') && !rStr.startsWith(' ')) {
      result.push(' ');
    }
    result.push(rStr);
  }

  return result.join('');
}

/**
 * Main database sync resolver. Resolves incoming client operations against Postgres
 * and returns the reconciliation results. Runs inside a database transaction.
 */
export async function resolveSyncOperations(
  documentId: string,
  userId: string,
  operations: SyncOperationPayload[]
): Promise<SyncResponse> {
  const mergedBlocks: any[] = [];
  const deletedBlockIds: string[] = [];
  const clientUpdates: any[] = [];

  await db.transaction(async (tx) => {
    // 1. Fetch current blocks in database for this document to check server state
    const serverBlocks = await tx
      .select()
      .from(documentBlocks)
      .where(eq(documentBlocks.documentId, documentId));

    const serverBlockMap = new Map(serverBlocks.map((b) => [b.id, b]));

    // 2. Fetch tombstones for this document
    const tombstones = await tx
      .select()
      .from(syncTombstones)
      .where(eq(syncTombstones.documentId, documentId));
    const tombstoneMap = new Map(tombstones.map((t) => [t.id, t]));

    for (const op of operations) {
      const { blockId, action, blockData } = op;

      // Handle Delete Action
      if (action === 'delete') {
        const hasBlock = serverBlockMap.has(blockId);
        
        if (hasBlock) {
          await tx.delete(documentBlocks).where(eq(documentBlocks.id, blockId));
          serverBlockMap.delete(blockId);
        }

        // Add to tombstone if not already there
        if (!tombstoneMap.has(blockId)) {
          await tx.insert(syncTombstones).values({
            id: blockId,
            documentId,
            deletedAt: new Date()
          }).onConflictDoNothing();
        }

        deletedBlockIds.push(blockId);
        continue;
      }

      // Handle Upsert Action
      if (action === 'upsert' && blockData) {
        const serverBlock = serverBlockMap.get(blockId);
        const isTombstoned = tombstoneMap.has(blockId);

        // Deletion wins unless the client's edit is strictly newer than the deletion
        if (isTombstoned) {
          const ts = tombstoneMap.get(blockId)!;
          const clientEditTime = new Date(blockData.updatedAt).getTime();
          const deleteTime = new Date(ts.deletedAt).getTime();
          
          if (clientEditTime <= deleteTime) {
            // Block is deleted, skip upsert
            clientUpdates.push({
              blockId,
              action: 'delete'
            });
            continue;
          } else {
            // Restore block: remove from tombstones
            await tx.delete(syncTombstones).where(eq(syncTombstones.id, blockId));
            tombstoneMap.delete(blockId);
          }
        }

        // Case 1: Block doesn't exist on server
        if (!serverBlock) {
          const newBlock = {
            id: blockId,
            documentId,
            type: blockData.type,
            content: blockData.content,
            order: blockData.order,
            version: blockData.version || 1,
            lastEditedBy: userId,
            updatedAt: new Date(blockData.updatedAt)
          };
          await tx.insert(documentBlocks).values(newBlock);
          mergedBlocks.push(newBlock);
          serverBlockMap.set(blockId, newBlock); // Update map inline!
          continue;
        }

        // Case 2: Block exists. Perform conflict resolution
        const serverVersion = serverBlock.version;
        const clientVersion = blockData.version;

        if (clientVersion > serverVersion) {
          // Client has advanced edits. Apply them directly.
          const updatedBlock = {
            type: blockData.type,
            content: blockData.content,
            order: blockData.order,
            version: clientVersion,
            lastEditedBy: userId,
            updatedAt: new Date(blockData.updatedAt)
          };
          await tx.update(documentBlocks).set(updatedBlock).where(eq(documentBlocks.id, blockId));
          const finalUpdated = { ...serverBlock, ...updatedBlock };
          mergedBlocks.push(finalUpdated);
          serverBlockMap.set(blockId, finalUpdated); // Update map inline!
        } else {
          // Client is at same version or behind. Let's check for concurrent edit conflict.
          const baseContent = blockData.baseContent || '';
          
          if (baseContent === serverBlock.content) {
            // No concurrent conflict (server content has not changed from client's base)
            const updatedBlock = {
              type: blockData.type,
              content: blockData.content,
              order: blockData.order,
              version: serverVersion + 1, // increment
              lastEditedBy: userId,
              updatedAt: new Date()
            };
            await tx.update(documentBlocks).set(updatedBlock).where(eq(documentBlocks.id, blockId));
            const finalUpdated = { ...serverBlock, ...updatedBlock };
            mergedBlocks.push(finalUpdated);
            serverBlockMap.set(blockId, finalUpdated); // Update map inline!
          } else {
            // Actual concurrent conflict! Apply 3-way merge.
            const mergedContent = diff3Merge(baseContent, blockData.content, serverBlock.content);
            
            const updatedBlock = {
              type: blockData.type,
              content: mergedContent,
              order: blockData.order, // order string uses fractional index
              version: serverVersion + 1, // increment
              lastEditedBy: userId,
              updatedAt: new Date()
            };
            await tx.update(documentBlocks).set(updatedBlock).where(eq(documentBlocks.id, blockId));
            
            const finalMerged = { ...serverBlock, ...updatedBlock };
            mergedBlocks.push(finalMerged);
            serverBlockMap.set(blockId, finalMerged); // Update map inline!

            // Inform client that their local state needs updating to this merged state
            clientUpdates.push({
              blockId,
              action: 'upsert',
              data: {
                type: finalMerged.type,
                content: finalMerged.content,
                order: finalMerged.order,
                version: finalMerged.version,
                lastEditedBy: finalMerged.lastEditedBy,
                updatedAt: finalMerged.updatedAt.toISOString()
              }
            });
          }
        }
      }
    }
  });

  return {
    mergedBlocks,
    deletedBlockIds,
    clientUpdates
  };
}
