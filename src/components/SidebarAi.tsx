'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw, FileText } from 'lucide-react';
import { LocalBlock } from '@/lib/localDb';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface SidebarAiProps {
  blocks: LocalBlock[];
}

export default function SidebarAi({ blocks }: SidebarAiProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am your AI assistant. I can summarize this document, co-write blocks, check grammar, or answer questions about your text content. Try clicking "Summarize Document" below or type a prompt.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Combine block text to supply full context to Gemini model
  const getDocumentContent = () => {
    return blocks.map((b) => b.content.trim()).filter(Boolean).join('\n\n');
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessageText = input.trim();
    setInput('');
    
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userMessageText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const documentText = getDocumentContent();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: documentText || '(The document is currently blank)',
          message: userMessageText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'model',
            text: data.reply || 'No response from AI.',
          },
        ]);
      } else {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'model',
            text: `Error: ${err.error || 'Failed to connect to AI server.'}`,
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: 'Failed to communicate with AI endpoint.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (isLoading) return;

    const documentText = getDocumentContent();
    if (!documentText) {
      alert('The document must contain some text to summarize!');
      return;
    }

    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: 'Please generate a summary of this document.',
      },
    ]);

    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'model',
            text: data.summary || 'Failed to generate a summary.',
          },
        ]);
      } else {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'model',
            text: `Error: ${err.error || 'Could not generate summary.'}`,
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: 'Failed to call the summarization helper.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 text-zinc-300 w-80 select-none">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold tracking-wider text-zinc-100 uppercase font-sans">AI Assistant</h2>
        </div>
        <button
          onClick={handleSummarize}
          disabled={isLoading}
          className="flex items-center gap-1 text-[10px] bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 text-indigo-400 font-bold px-2 py-1 rounded transition disabled:opacity-50"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Summarize</span>
        </button>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 ${
                msg.role === 'model'
                  ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
            >
              {msg.role === 'model' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            {/* Bubble */}
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed max-w-[80%] whitespace-pre-wrap ${
                msg.role === 'model'
                  ? 'bg-zinc-900/60 text-zinc-200 border border-zinc-800/80'
                  : 'bg-indigo-600/10 text-indigo-200 border border-indigo-600/20 font-medium'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center border bg-indigo-600/10 border-indigo-500/30 text-indigo-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-zinc-900/60 text-zinc-400 border border-zinc-800/80 p-3 rounded-lg text-xs flex items-center gap-1.5 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Chat Form */}
      <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-zinc-900/20">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Ask about document context..."
            className="flex-1 bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-indigo-500 transition text-zinc-200"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg px-3 py-2 transition flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
