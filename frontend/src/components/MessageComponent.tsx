"use client";

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SearchResults } from './SearchResults';
import { Copy, Sparkles, FileText, User, Check, ThumbsUp, ThumbsDown, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MessageComponentProps {
  msg: {
    sender: string;
    text: string;
    mode?: string;
    timestamp: string;
    isError?: boolean;
    animate?: boolean;
    feedback?: 'like' | 'dislike' | null;
    model?: string;
    searchResults?: any[];
    pending?: Record<string, string | number> | null;
  };
  onCopy: (text: string) => void;
  currentTabConfig: {
    gradient: string;
    label: string;
  };
  isLatest?: boolean;
  onTyping?: () => void;
  msgIndex?: number;
  onFeedback?: (index: number, fb: 'like' | 'dislike' | null) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
  ul: ({ children }: any) => <ul className="mb-3 list-disc space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-7">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  h1: ({ children }: any) => <h1 className="mb-3 mt-4 text-lg font-bold first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
    ) : (
      <code className="font-mono text-[0.85em]">{children}</code>
    ),
  pre: ({ children }: any) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 text-sm">{children}</pre>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="mb-3 border-l-2 border-border pl-4 italic text-muted-foreground">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline underline-offset-2 hover:text-blue-400">
      {children}
    </a>
  ),
};

function splitSources(text: string): { body: string; sources: string[] } {
  const marker = '📚 Sources:';
  const idx = text.indexOf(marker);
  if (idx === -1) return { body: text, sources: [] };
  const body = text.slice(0, idx).trim();
  const sources = text
    .slice(idx + marker.length)
    .split('\n')
    .map((l) => l.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);
  return { body, sources };
}

const CHARS_PER_TICK = 18;
const TICK_MS = 16;

export const MessageComponent: React.FC<MessageComponentProps> = ({ msg, onCopy, currentTabConfig, isLatest, onTyping, msgIndex = 0, onFeedback, onRegenerate, isStreaming, onApprove, onReject }) => {
  const isUser = msg.sender === 'user';
  const isSearch = msg.mode === 'search';
  const shouldAnimate = !!(msg.animate && isLatest && !isUser && !msg.isError);

  const [visibleLen, setVisibleLen] = useState(shouldAnimate ? 0 : msg.text.length);
  const [copied, setCopied] = useState(false);
  const doneRef = useRef(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    const timer = setInterval(() => {
      setVisibleLen(prev => {
        const next = prev + CHARS_PER_TICK;
        if (next >= msg.text.length) {
          clearInterval(timer);
          doneRef.current = true;
          return msg.text.length;
        }
        return next;
      });
      onTyping?.();
    }, TICK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Non-animated messages render text live (streaming updates flow straight through)
  const visibleText = shouldAnimate ? msg.text.slice(0, visibleLen) : msg.text;
  const { body, sources } = splitSources(visibleText);
  const isTyping = shouldAnimate && !doneRef.current && visibleLen < msg.text.length;

  const handleCopy = () => {
    onCopy(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="animate-fade-up flex justify-end">
        <div className="flex max-w-[85%] items-start gap-3 md:max-w-[75%]">
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-6">{msg.text}</p>
          </div>
          <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group animate-fade-up flex justify-start">
      <div className="flex w-full max-w-[90%] items-start gap-3">
        <img src="/brand/ai-chip.png" alt="AI" className={`mt-0.5 h-7 w-7 flex-shrink-0 rounded-full ${isTyping ? 'animate-pulse-glow' : ''}`} />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{currentTabConfig.label}</span>
            {msg.model && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/80">
                {msg.model.replace('gemini-', 'g-')}
              </span>
            )}
            <span className="text-xs text-muted-foreground/60">·</span>
            <span className="text-xs text-muted-foreground/60">{new Date(msg.timestamp).toLocaleTimeString()}</span>
            <Button
              onClick={handleCopy}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              title="Copy message"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          {msg.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {msg.text}
            </div>
          ) : (
            <div className="text-sm text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {body}
              </ReactMarkdown>
              {isTyping && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground/60 align-middle" />}
            </div>
          )}

          {!isTyping && sources.length > 0 && (
            <div className="mt-3 animate-fade-in border-t border-border/60 pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Sources</div>
              <div className="flex flex-wrap gap-2">
                {sources.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                  >
                    <FileText className="h-3 w-3" />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isSearch && msg.searchResults && (
            <div className="mt-4">
              <SearchResults results={msg.searchResults} onCopy={onCopy} />
            </div>
          )}

          {/* Approval card — side-effecting agent actions need a click first */}
          {msg.pending && (
            <div className="mt-3 w-full max-w-md overflow-hidden rounded-xl border border-violet-500/40 bg-violet-500/5">
              <div className="flex items-center gap-2 border-b border-violet-500/20 px-4 py-2.5">
                <ShieldCheck className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold text-violet-500">I&apos;m ready to do this — your approval needed</span>
              </div>
              <div className="space-y-1.5 px-4 py-3">
                {msg.pending.kind === 'email' && (
                  <>
                    <p className="text-xs"><span className="text-muted-foreground">To:</span> <span className="font-medium">{msg.pending.to}</span></p>
                    <p className="text-xs"><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{msg.pending.subject}</span></p>
                    <p className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-foreground/80">{msg.pending.body}</p>
                  </>
                )}
                {msg.pending.kind === 'meeting' && (
                  <>
                    <p className="text-xs"><span className="text-muted-foreground">Meeting:</span> <span className="font-medium">{msg.pending.title}</span></p>
                    <p className="text-xs"><span className="text-muted-foreground">When:</span> <span className="font-medium">{msg.pending.when}</span></p>
                    <p className="text-xs"><span className="text-muted-foreground">Duration:</span> {msg.pending.duration_minutes} min</p>
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  <Button onClick={onApprove} size="sm" className="h-8 flex-1 bg-gradient-to-r from-violet-500 to-purple-600 text-xs text-white hover:opacity-90">
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button onClick={onReject} variant="outline" size="sm" className="h-8 flex-1 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Action toolbar — visible on hover when not streaming */}
          {!msg.isError && !isStreaming && (
            <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={handleCopy}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Copy"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => onFeedback?.(msgIndex, msg.feedback === 'like' ? null : 'like')}
                className={`rounded p-1.5 transition-colors hover:bg-accent ${msg.feedback === 'like' ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'}`}
                title="Good response"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onFeedback?.(msgIndex, msg.feedback === 'dislike' ? null : 'dislike')}
                className={`rounded p-1.5 transition-colors hover:bg-accent ${msg.feedback === 'dislike' ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
                title="Bad response"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              {isLatest && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="flex items-center gap-1 rounded px-1.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Regenerate response"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
