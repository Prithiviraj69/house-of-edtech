'use client';

import { useEffect, useState } from 'react';
import { LocalBlock } from '@/lib/localDb';
import { syncEngine } from '@/lib/syncEngine';
import { getMidpoint } from '@/lib/fractionalIndexing';
import EditorBlock from './EditorBlock';
import { FileEdit, AlertCircle } from 'lucide-react';

interface EditorCanvasProps {
  documentId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export default function EditorCanvas({ documentId, userId, role }: EditorCanvasProps) {
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to blocks list stream from SyncEngine
    const unsubscribe = syncEngine.subscribeBlocks((loadedBlocks) => {
      setBlocks(loadedBlocks);
    });

    return () => unsubscribe();
  }, [documentId]);

  const handleUpdateBlock = async (blockId: string, content: string, type: LocalBlock['type']) => {
    if (role === 'viewer') return;
    
    const existing = blocks.find((b) => b.id === blockId);
    if (!existing) return;

    await syncEngine.handleLocalBlockUpsert({
      id: blockId,
      type,
      content,
      order: existing.order,
      version: existing.version + 1, // Advance version locally
      lastEditedBy: userId,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (role === 'viewer') return;

    // Keep at least one block in the document
    if (blocks.length <= 1) {
      alert('A document must have at least one text block!');
      return;
    }

    const index = blocks.findIndex((b) => b.id === blockId);
    let newFocusId: string | null = null;
    
    if (index > 0) {
      newFocusId = blocks[index - 1]!.id;
    } else if (index < blocks.length - 1) {
      newFocusId = blocks[index + 1]!.id;
    }

    if (newFocusId) setFocusedBlockId(newFocusId);
    await syncEngine.handleLocalBlockDelete(blockId);
  };

  const handleSplitBlock = async (blockId: string, cursorOffset: number) => {
    if (role === 'viewer') return;

    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    const currentBlock = blocks[index]!;
    const content = currentBlock.content;

    // Split text content at cursor offset
    const prefix = content.substring(0, cursorOffset);
    const suffix = content.substring(cursorOffset);

    // Calculate fractional order string midpoint
    const nextBlock = index + 1 < blocks.length ? blocks[index + 1] : null;
    const newOrder = getMidpoint(currentBlock.order, nextBlock?.order || '');

    const newBlockId = crypto.randomUUID();

    // 1. Update existing block with prefix content
    await syncEngine.handleLocalBlockUpsert({
      id: blockId,
      type: currentBlock.type,
      content: prefix,
      order: currentBlock.order,
      version: currentBlock.version + 1,
      lastEditedBy: userId,
      updatedAt: new Date().toISOString(),
    });

    // 2. Insert new paragraph block with suffix content
    // If original block was a heading, default split to paragraph for smooth writing flow
    const nextType: LocalBlock['type'] = currentBlock.type.startsWith('heading') ? 'paragraph' : currentBlock.type;
    await syncEngine.handleLocalBlockUpsert({
      id: newBlockId,
      type: nextType,
      content: suffix,
      order: newOrder,
      version: 1,
      lastEditedBy: userId,
      updatedAt: new Date().toISOString(),
    });

    // 3. Move keyboard cursor focus to newly created block
    setFocusedBlockId(newBlockId);
  };

  const handleMergeWithPrevious = async (blockId: string) => {
    if (role === 'viewer') return;

    const index = blocks.findIndex((b) => b.id === blockId);
    if (index <= 0) return; // No previous block to merge into

    const currentBlock = blocks[blockId === blocks[index]!.id ? index : -1]!;
    const prevBlock = blocks[index - 1]!;
    
    // Concatenate contents
    const mergedContent = prevBlock.content + currentBlock.content;
    const originalPrevLength = prevBlock.content.length;

    // 1. Update previous block with combined content
    await syncEngine.handleLocalBlockUpsert({
      id: prevBlock.id,
      type: prevBlock.type,
      content: mergedContent,
      order: prevBlock.order,
      version: prevBlock.version + 1,
      lastEditedBy: userId,
      updatedAt: new Date().toISOString(),
    });

    // 2. Delete current block
    await syncEngine.handleLocalBlockDelete(blockId);

    // 3. Focus previous block and reposition cursor
    setFocusedBlockId(prevBlock.id);
  };

  const handleFocusNext = (blockId: string) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index !== -1 && index + 1 < blocks.length) {
      setFocusedBlockId(blocks[index + 1]!.id);
    }
  };

  const handleFocusPrev = (blockId: string) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index > 0) {
      setFocusedBlockId(blocks[index - 1]!.id);
    }
  };

  const handleAddBlockAtEnd = async () => {
    if (role === 'viewer') return;

    const lastBlock = blocks[blocks.length - 1];
    const newOrder = getMidpoint(lastBlock?.order || '', '');
    const newBlockId = crypto.randomUUID();

    await syncEngine.handleLocalBlockUpsert({
      id: newBlockId,
      type: 'paragraph',
      content: '',
      order: newOrder,
      version: 1,
      lastEditedBy: userId,
      updatedAt: new Date().toISOString(),
    });

    setFocusedBlockId(newBlockId);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 px-8 py-12 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-2">
        
        {role === 'viewer' && (
          <div className="mb-6 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs px-4 py-3 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>You are viewing this document in <strong>Read-Only Mode</strong>. You cannot edit content or snapshots.</span>
          </div>
        )}

        {/* Canvas Blocks Timeline */}
        <div className="flex flex-col gap-2 min-h-[400px]">
          {blocks.map((block) => (
            <EditorBlock
              key={block.id}
              block={block}
              role={role}
              onUpdate={handleUpdateBlock}
              onDelete={handleDeleteBlock}
              onSplit={handleSplitBlock}
              onMergeWithPrevious={handleMergeWithPrevious}
              onFocusNext={handleFocusNext}
              onFocusPrev={handleFocusPrev}
              isFocusedOnMount={focusedBlockId === block.id}
            />
          ))}
        </div>

        {/* Append block helper area */}
        {role !== 'viewer' && (
          <div
            onClick={handleAddBlockAtEnd}
            className="mt-6 py-4 border-2 border-dashed border-zinc-800/60 rounded-xl hover:border-zinc-700 hover:bg-zinc-900/10 cursor-pointer flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-400 transition group select-none"
          >
            <FileEdit className="w-4 h-4 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
            <span className="text-xs font-semibold">Click to add a new paragraph</span>
          </div>
        )}
      </div>
    </div>
  );
}
