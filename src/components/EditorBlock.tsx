'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { LocalBlock } from '@/lib/localDb';
import { Sparkles } from 'lucide-react';

interface EditorBlockProps {
  block: LocalBlock;
  role: 'owner' | 'editor' | 'viewer';
  onUpdate: (blockId: string, content: string, type: LocalBlock['type']) => void;
  onDelete: (blockId: string) => void;
  onSplit: (blockId: string, cursorOffset: number) => void;
  onMergeWithPrevious: (blockId: string) => void;
  onFocusNext: (blockId: string) => void;
  onFocusPrev: (blockId: string) => void;
  isFocusedOnMount: boolean;
}

export default function EditorBlock({
  block,
  role,
  onUpdate,
  onDelete,
  onSplit,
  onMergeWithPrevious,
  onFocusNext,
  onFocusPrev,
  isFocusedOnMount,
}: EditorBlockProps) {
  const [content, setContent] = useState(block.content);
  const [isFocused, setIsFocused] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isFetchingAi, setIsFetchingAi] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state with prop updates only if user is NOT typing (not focused)
  useEffect(() => {
    if (!isFocused) {
      setContent(block.content);
    }
  }, [block.content, isFocused]);

  // Focus block if instructed by parent canvas
  useEffect(() => {
    if (isFocusedOnMount && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to the end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isFocusedOnMount]);

  // Auto-resize textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [content]);

  // Debounced save updates
  useEffect(() => {
    if (content === block.content) return;

    const timer = setTimeout(() => {
      onUpdate(block.id, content, block.type);
    }, 500); // 500ms debounce typing

    return () => clearTimeout(timer);
  }, [content, block.id, block.type]);

  // Debounced AI Autocomplete trigger (triggers 1.5 seconds after user stops typing)
  useEffect(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setAiSuggestion('');

    const isSimulatedOffline = typeof window !== 'undefined' && localStorage.getItem('simulated_offline') === 'true';

    if (isFocused && content.trim().length > 5 && role !== 'viewer' && !isSimulatedOffline) {
      aiTimeoutRef.current = setTimeout(() => {
        triggerAiAutocomplete();
      }, 1500);
    }

    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [content, isFocused, role]);

  const triggerAiAutocomplete = async () => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart || 0;
    const contextBefore = content.substring(0, cursor);
    const contextAfter = content.substring(cursor);

    setIsFetchingAi(true);
    try {
      const res = await fetch('/api/ai/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextBefore, contextAfter }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.completion && data.completion.trim().length > 0) {
          setAiSuggestion(data.completion);
        }
      }
    } catch (e) {
      console.warn('AI autocomplete request failed. Might be offline or API limit.');
    } finally {
      setIsFetchingAi(false);
    }
  };

  const acceptAiSuggestion = () => {
    if (!aiSuggestion || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursor = textarea.selectionStart || 0;
    const nextContent = content.substring(0, cursor) + aiSuggestion + content.substring(cursor);
    
    setContent(nextContent);
    setAiSuggestion('');

    // Restore cursor position to end of insertion
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = cursor + aiSuggestion.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const totalLength = textarea.value.length;

    // 1. Accept AI Suggestion with TAB
    if (e.key === 'Tab' && aiSuggestion) {
      e.preventDefault();
      acceptAiSuggestion();
      return;
    }

    // 2. Split block on ENTER
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (role === 'viewer') return;
      onSplit(block.id, cursor);
      return;
    }

    // 3. Merge with previous block on BACKSPACE at index 0
    if (e.key === 'Backspace' && cursor === 0) {
      if (role === 'viewer') return;
      e.preventDefault();
      onMergeWithPrevious(block.id);
      return;
    }

    // 4. Keyboard Arrow Navigation
    if (e.key === 'ArrowUp' && cursor === 0) {
      e.preventDefault();
      onFocusPrev(block.id);
    }

    if (e.key === 'ArrowDown' && cursor === totalLength) {
      e.preventDefault();
      onFocusNext(block.id);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Force final save on blur immediately if content changed
    if (content !== block.content) {
      onUpdate(block.id, content, block.type);
    }
  };

  const isReadOnly = role === 'viewer';

  // Styling maps based on block type
  const getBlockStyle = () => {
    switch (block.type) {
      case 'heading-1':
        return 'text-2xl font-bold text-zinc-100 tracking-tight placeholder-zinc-700 mt-4 mb-2';
      case 'heading-2':
        return 'text-xl font-semibold text-zinc-200 tracking-tight placeholder-zinc-700 mt-3 mb-1.5';
      case 'heading-3':
        return 'text-lg font-medium text-zinc-300 tracking-tight placeholder-zinc-700 mt-2 mb-1';
      case 'code':
        return 'font-mono text-xs bg-zinc-900 border border-zinc-800 text-teal-400 p-3 rounded-lg leading-relaxed shadow-inner placeholder-zinc-700';
      case 'todo':
        return 'text-sm text-zinc-300 placeholder-zinc-600';
      case 'paragraph':
      default:
        return 'text-sm text-zinc-300 leading-relaxed placeholder-zinc-600';
    }
  };

  return (
    <div className="relative group w-full flex items-start gap-3 py-1 px-2 rounded-md hover:bg-zinc-900/10 transition-colors">
      {/* Type-Specific Selector Dropdown (Hover action helper) */}
      {!isReadOnly && isFocused && (
        <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex items-center bg-zinc-900 border border-zinc-800 rounded shadow-md z-10 px-1 py-0.5">
          <select
            value={block.type}
            onChange={(e) => onUpdate(block.id, content, e.target.value as LocalBlock['type'])}
            className="bg-transparent text-[10px] text-zinc-400 focus:outline-none cursor-pointer font-semibold"
          >
            <option value="paragraph">Text</option>
            <option value="heading-1">H1</option>
            <option value="heading-2">H2</option>
            <option value="heading-3">H3</option>
            <option value="code">Code</option>
            <option value="todo">Task</option>
          </select>
        </div>
      )}

      {/* Todo checkbox */}
      {block.type === 'todo' && (
        <input
          type="checkbox"
          disabled={isReadOnly}
          checked={content.startsWith('[x] ')}
          onChange={(e) => {
            let nextContent = content;
            if (e.target.checked) {
              nextContent = nextContent.replace(/^(\[ \])?/, '[x] ');
            } else {
              nextContent = nextContent.replace(/^\[x\] /, '[ ] ');
            }
            setContent(nextContent);
            onUpdate(block.id, nextContent, block.type);
          }}
          className="mt-1 w-4 h-4 rounded border-zinc-700 text-indigo-600 bg-zinc-900 focus:ring-indigo-500 cursor-pointer"
        />
      )}

      {/* Main Textarea input */}
      <textarea
        ref={textareaRef}
        value={block.type === 'todo' ? content.replace(/^(\[ \]|\[x\]) /, '') : content}
        onChange={(e) => {
          let val = e.target.value;
          if (block.type === 'todo') {
            const prefix = content.startsWith('[x] ') ? '[x] ' : '[ ] ';
            val = prefix + val;
          }
          setContent(val);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        readOnly={isReadOnly}
        placeholder={
          block.type.startsWith('heading')
            ? 'Heading'
            : block.type === 'code'
            ? '// write some code here...'
            : 'Type something...'
        }
        rows={1}
        className={`flex-1 w-full bg-transparent resize-none border-none outline-none focus:ring-0 p-0 ${getBlockStyle()}`}
      />

      {/* Hover Delete Action button */}
      {!isReadOnly && (
        <button
          onClick={() => onDelete(block.id)}
          title="Delete Block"
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0 self-center"
        >
          <span className="text-[10px] font-bold">×</span>
        </button>
      )}

      {/* AI Autocomplete suggestion overlay */}
      {aiSuggestion && (
        <div
          onClick={acceptAiSuggestion}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-950 border border-indigo-800/80 rounded-md shadow-lg py-1 px-2.5 z-20 flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium cursor-pointer animate-pulse hover:bg-indigo-900 hover:border-indigo-600"
        >
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>
            Autocomplete: <span className="text-zinc-200">"{aiSuggestion}"</span> (Tab to insert)
          </span>
        </div>
      )}
    </div>
  );
}
