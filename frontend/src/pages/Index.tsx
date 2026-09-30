import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageComponent } from '@/components/MessageComponent';
import { AuthModal } from '@/components/AuthModal';
import { ClearConfirmModal } from '@/components/ClearConfirmModal';
import { Link } from 'react-router-dom';
import { MAIN_TABS, SUGGESTIONS, UNIFIED } from '@/lib/products';
import { setPageMeta, PRODUCT_META } from '@/lib/page-meta';
import { useAuth, GUEST_LIMIT } from '@/hooks/use-auth';
import { getToken, authApi } from '@/api/auth';

import {
  Plus,
  Trash,
  Send,
  Search,
  RotateCw,
  Menu,
  Sun,
  Moon,
  ChevronDown,
  Bot,
  X,
  MessageSquare,
  Clock,
  Sparkles,
  Star,
  Paperclip,
  Loader2,
  Zap,
  Brain,
  Crown,
  Lock,
  LogOut,
  Settings as SettingsIcon,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import type { Chat } from '@/types/chat';

function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Intelligent capability tagline per product — shown as the sidebar subtitle
const PRODUCT_TAGLINES: Record<string, string> = {
  unified: 'One assistant · routes to the right engine',
  assistant: 'Answers grounded in your documents',
  search: 'Semantic search across policies & docs',
  agent: 'Tasks, reminders, meetings & more',
};

// Model tier selector options
const MODEL_TIER_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: Sparkles },
  { id: 'lite', label: 'Fast', icon: Zap },
  { id: 'smart', label: 'Smart', icon: Brain },
  { id: 'pro', label: 'Pro', icon: Crown },
] as const;

// Intent router — picks the engine for a unified-mode message
const AGENT_RE = /\b(remind|reminder|send.{0,10}email|e-?mail|schedule|meeting|todo|to-?do|add a task|create.{0,12}(task|todo|reminder|meeting)|book|appointment|call the|call my|notify)\b/i;
const SEARCH_RE = /\b(find|search|look ?up|locate|where is|list (all|the)|show me (all|the)|which documents?)\b/i;

function detectIntent(query: string): 'agent' | 'search' | 'assistant' {
  if (AGENT_RE.test(query)) return 'agent';
  if (SEARCH_RE.test(query)) return 'search';
  return 'assistant';
}

const Index = ({ mode }: { mode: string }) => {
  const initialTab = mode === 'unified' || MAIN_TABS.some(t => t.id === mode) ? mode : 'unified';
  // State variables
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentQueryForChat, setCurrentQueryForChat] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');

  // Upload a file → backend chunks + indexes it into the live FAISS corpus
  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadName(file.name);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      toast({ title: `Indexed ${data.filename}`, description: `${data.chunks} chunks added — ask questions about it now.` });
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Could not index file', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadName('');
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [activeMainTab, setActiveMainTab] = useState(initialTab);
  const [modelTier, setModelTier] = useState(() => localStorage.getItem('GenAiModelTier') || 'auto');
  const [theme, setTheme] = useState(() => localStorage.getItem('GenAiWorkspaceTheme') || 'dark');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [chatToClear, setChatToClear] = useState<string | null>(null);
  const [showScrollTip, setShowScrollTip] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);

  // Approve / reject a pending agent action (email, meeting, …)
  const handleApproveAction = async (chatId: string, index: number) => {
    const chat = allChats.find(c => c.id === chatId);
    const msg = chat?.messages[index];
    if (!msg?.pending) return;
    const patch = (text: string) => setAllChats(prev => prev.map(c => c.id !== chatId ? c : {
      ...c,
      messages: c.messages.map((m, i) => i === index ? { ...m, text, pending: null } : m),
    }));
    patch('Working on it…');
    try {
      const res = await fetch(`${API_BASE_URL}/agent/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: msg.pending }),
      });
      const data = await res.json();
      patch(data.message || (data.ok ? 'Done' : 'Failed'));
    } catch {
      patch('❌ Could not reach the backend');
    }
  };

  const handleRejectAction = (chatId: string, index: number) => {
    setAllChats(prev => prev.map(c => c.id !== chatId ? c : {
      ...c,
      messages: c.messages.map((m, i) => i === index ? { ...m, text: '🚫 Cancelled — nothing was sent or scheduled.', pending: null } : m),
    }));
  };
  const { user, loading: authLoading, setAuthModalOpen, logout, guestUsed, messagesLeft, canSend, consumeGuestMessage } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  // Intelligent logout: brief processing state, then back to this product's empty chat —
  // never navigates away to the landing page.
  const handleLogout = async () => {
    setSigningOut(true);
    await new Promise(r => setTimeout(r, 900)); // let the sign-out animation play
    logout(); // userKey flips to 'guest' → the namespace effect reloads that account's chats
    setActiveChatId(null);
    setCurrentQueryForChat('');
    setApiError('');
    setSigningOut(false);
    toast({
      title: 'Signed out',
      description: `You're now browsing ${currentTabConfig.label} as a guest`,
    });
  };

  // Debounced search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(chatSearchTerm);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(chatSearchTerm);
    }, 300);

    return () => clearTimeout(handler);
  }, [chatSearchTerm]);

  // Per-user storage namespaces — chats are isolated per account on this browser
  const userKey = user ? `u${user.id}` : 'guest';
  const chatsKey = `GenAiWorkspaceChats:${userKey}`;
  const activeKey = `GenAiWorkspaceLastActiveChatId:${userKey}`;
  // Guards the save effect: only persist once this user's chats have loaded.
  // Prevents a login/logout race from writing the previous user's chats into the new namespace.
  const loadedKeyRef = useRef<string | null>(null);

  // Load chats when the signed-in account changes (login/logout switches namespaces)
  useEffect(() => {
    if (authLoading) return; // wait until we know who's signed in
    // legacy shared key migrates into the current user's namespace once
    // sessionStorage per-tab workspace + one-time migration from any legacy shared key
    const saved = sessionStorage.getItem(chatsKey)
      || localStorage.getItem(chatsKey)
      || localStorage.getItem('GenAiWorkspaceChats')
      || sessionStorage.getItem('GenAiWorkspaceChats');
    let localChats: Chat[] = [];
    if (saved) {
      try {
        localChats = JSON.parse(saved).map((c: Partial<Chat>) => ({
          ...c,
          createdAt: c.createdAt || new Date(0).toISOString(),
          mode: c.mode || 'unified',
        }));
      } catch {
        localChats = [];
      }
    }
    localStorage.removeItem('GenAiWorkspaceChats'); // retire legacy shared keys
    sessionStorage.removeItem('GenAiWorkspaceChats');
    localStorage.removeItem(chatsKey); // move to sessionStorage (per-tab)

    const applyChats = (list: Chat[]) => {
      loadedKeyRef.current = userKey;
      setAllChats(list);
      setActiveMainTab(initialTab);
      const lastChatId = sessionStorage.getItem(activeKey) || localStorage.getItem(activeKey);
      localStorage.removeItem(activeKey);
      const relevant = list
        .filter(c => c.mode === initialTab)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActiveChatId(lastChatId && relevant.find(c => c.id === lastChatId) ? lastChatId : (relevant[0]?.id ?? null));
    };

    if (user) {
      // Signed in — server is the source of truth; fall back to local cache
      authApi.getChats().then(serverChats => {
        applyChats(serverChats.length > 0 ? serverChats : localChats);
      });
    } else {
      applyChats(localChats);
    }

    fetch(`${API_BASE_URL}/health`)
      .then(res => {
        if (!res.ok) console.warn('API health check failed or API not running');
      })
      .catch(() => console.warn('Cannot connect to API'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey, authLoading]);

  // One-time welcome prompt for guests entering a product (dismissible)
  useEffect(() => {
    if (!authLoading && !user && !sessionStorage.getItem('GenAiWelcomeShown')) {
      sessionStorage.setItem('GenAiWelcomeShown', '1');
      const t = setTimeout(() => setAuthModalOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [authLoading, user, setAuthModalOpen]);

  // In-app reminder notifications — watch the agent task log for new fired events
  useEffect(() => {
    let lastSeen = 0;
    let initialized = false;

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/agent/tasks/logs`);
        if (!res.ok) return;
        const { logs } = await res.json();
        if (!Array.isArray(logs) || logs.length === 0) return;
        const newest = Math.max(...logs.map((l: { timestamp: string }) => +new Date(l.timestamp)));
        if (!initialized) {
          lastSeen = newest; // baseline — don't toast old history
          initialized = true;
          return;
        }
        const fresh = logs.filter((l: { timestamp: string }) => +new Date(l.timestamp) > lastSeen);
        if (fresh.length === 0) return;
        lastSeen = newest;
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        for (const log of fresh.slice(0, 3)) {
          const label = (log.task_type || 'task').replace(/_/g, ' ');
          const text = (log.result || log.user_input || '').toString();
          toast({
            title: `⏰ ${log.task_type === 'create_reminder' ? 'Reminder created' : label[0].toUpperCase() + label.slice(1)}`,
            description: text.length > 90 ? text.slice(0, 90) + '…' : text,
          });
          // Browser notification too (if the user granted permission)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`GenAI Workspace — ${label}`, { body: text.slice(0, 120) });
          }
        }
      } catch { /* backend offline — stay quiet */ }
    };

    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  // Persist chats per-user + sync to server when signed in (debounced)
  useEffect(() => {
    if (authLoading) return;
    if (loadedKeyRef.current !== userKey) return; // don't leak the previous user's chats into this namespace
    const serializable = allChats.map(c => ({
      ...c,
      messages: c.messages.map(({ animate, ...m }) => m),
    }));
    if (allChats.length > 0) sessionStorage.setItem(chatsKey, JSON.stringify(serializable));
    else sessionStorage.removeItem(chatsKey);

    if (!user) return;
    const t = setTimeout(() => { authApi.saveChats(serializable); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChats, userKey]);

  useEffect(() => {
    if (activeChatId) sessionStorage.setItem(activeKey, activeChatId);
    else sessionStorage.removeItem(activeKey);
  }, [activeChatId, activeKey]);

  // Keep the active tab in sync with the route (/assistant, /search, /agent)
  useEffect(() => {
    if (MAIN_TABS.some(t => t.id === mode) && mode !== activeMainTab) {
      setActiveMainTab(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Change chat when tab switches
  useEffect(() => {
    const chats = allChats
      .filter(c => c.mode === activeMainTab)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (chats.length > 0) {
      if (!activeChatId || !chats.find(c => c.id === activeChatId)) {
        setActiveChatId(chats[0].id);
      }
    } else {
      setActiveChatId(null);
    }
    setCurrentQueryForChat('');
    setApiError('');
  }, [activeMainTab, allChats, activeChatId]);

  // Only ever show a chat belonging to this product — never another mode's chat
  const activeChat = allChats.find(c => c.id === activeChatId && c.mode === activeMainTab) || null;

  const filteredChats = useMemo(() => {
    return allChats
      .filter(c =>
        c.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (debouncedSearchTerm.length > 2 && c.messages.some(m => m.text.toLowerCase().includes(debouncedSearchTerm.toLowerCase())))
      )
      .filter(c => c.mode === activeMainTab)
      .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allChats, debouncedSearchTerm, activeMainTab]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.messages, isLoading]);

  useEffect(() => {
    if (!activeChat || activeChat.messages.length === 0) setCurrentQueryForChat('');
  }, [activeChat]);

  const currentTabConfig = activeMainTab === 'unified'
    ? UNIFIED
    : (MAIN_TABS.find(t => t.id === activeMainTab) || MAIN_TABS[0]);
  const isUnified = activeMainTab === 'unified';

  // Per-product browser tab: "AI Assistant · Document Q&A" + its own icon favicon
  const TAB_TITLES: Record<string, string> = {
    unified: 'GenAI Workspace · Ask anything',
    assistant: 'AI Assistant · Ask your docs',
    search: 'AI Search · Find anything',
    agent: 'AI Agent · Automate tasks',
  };
  useEffect(() => {
    const meta = PRODUCT_META[activeMainTab] || { colors: ['#3b82f6', '#6366f1'] as [string, string], glyph: 'bot' as const };
    // Tab always shows the product's capability — never chat content
    setPageMeta(TAB_TITLES[activeMainTab] || currentTabConfig.label, meta.colors, meta.glyph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab, currentTabConfig.label]);

  // Update the header when unified mode routes a message to a specific engine
  useEffect(() => {
    if (!isUnified) return;
    const botMsgs = activeChat?.messages.filter(m => m.sender === 'bot');
    const lastBot = botMsgs?.[botMsgs.length - 1];
    if (!lastBot?.mode || lastBot.mode === 'unified') return;
    const meta = PRODUCT_META[lastBot.mode] || PRODUCT_META.assistant;
    const names: Record<string, string> = { assistant: 'AI Assistant', search: 'AI Search', agent: 'AI Agent' };
    setPageMeta(`${names[lastBot.mode]} · routed by Workspace`, meta.colors, meta.glyph);
  }, [activeChat?.messages, isUnified]);

  const THINKING_PHRASES: Record<string, string[]> = {
    unified: ['Understanding your request…', 'Choosing the right engine…', 'Working on it…'],
    assistant: ['Thinking…', 'Reading your documents…', 'Drafting a response…'],
    search: ['Searching documents…', 'Scanning TechNova_Policies.docx…', 'Ranking results…'],
    agent: ['Understanding the task…', 'Choosing the right tool…', 'Working on it…'],
  };

  // Rotate status phrases while waiting for the backend
  useEffect(() => {
    if (!isLoading) return;
    const phrases = THINKING_PHRASES[activeMainTab] || THINKING_PHRASES.assistant;
    setThinkingIdx(0);
    const timer = setInterval(() => {
      setThinkingIdx(i => (i + 1) % phrases.length);
    }, 2200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, activeMainTab]);

  const handleNewChat = () => {
    const id = generateUniqueId();
    const title = `New ${currentTabConfig.label} chat`;
    const newChat: Chat = {
      id,
      title,
      messages: [],
      mode: activeMainTab,
      createdAt: new Date().toISOString(),
    };
    setAllChats(prev => [newChat, ...prev]);
    setActiveChatId(id);
    setCurrentQueryForChat('');
    setSidebarOpen(false);
    if (textareaRef.current) textareaRef.current.focus();
    toast({
      title: "New chat created",
      description: `Started a new ${currentTabConfig.label} chat`,
    });
  };

  const handleSelectChat = (id: string) => {
    const chat = allChats.find(c => c.id === id);
    if (chat && chat.mode === activeMainTab) {
      setActiveChatId(id);
      setApiError('');
      setSidebarOpen(false);
    }
  };

  const handleDeleteChat = (id: string) => {
    setAllChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      const remaining = allChats
        .filter(c => c.id !== id && c.mode === activeMainTab)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      setApiError('');
    }
    toast({
      title: "Chat deleted",
      description: "The chat has been permanently deleted",
    });
  };

  const handleClearMessagesInActiveChat = () => {
    if (!activeChat || activeChat.messages.length === 0) return;
    setChatToClear(activeChat.id);
    setShowClearConfirm(true);
  };

  const confirmClearChat = () => {
    if (chatToClear) {
      setAllChats(prev => prev.map(c => c.id === chatToClear ? { ...c, messages: [] } : c));
      if (activeChat && activeChat.id === chatToClear) {
        setActiveChatId(null);
      }
      toast({
        title: "Chat cleared",
        description: "All messages have been removed from the chat",
      });
    }
    setShowClearConfirm(false);
    setChatToClear(null);
  };

  const cancelClearChat = () => {
    setShowClearConfirm(false);
    setChatToClear(null);
  };

  const sendQuery = (query: string) => {
    if (!activeChat) {
      const id = generateUniqueId();
      const newChat: Chat = {
        id,
        title: `New ${currentTabConfig.label} chat`,
        messages: [],
        mode: activeMainTab,
        createdAt: new Date().toISOString(),
      };
      setAllChats(prev => [newChat, ...prev]);
      setActiveChatId(id);
      setCurrentQueryForChat(query);
      // Defer send until state settles
      setTimeout(() => submitQuery(id, query), 0);
    } else {
      submitQuery(activeChat.id, query);
    }
  };

  const handleFeedback = (index: number, fb: 'like' | 'dislike' | null) => {
    setAllChats(prev => prev.map(c => c.id === activeChatId
      ? { ...c, messages: c.messages.map((m, i) => (i === index ? { ...m, feedback: fb } : m)) }
      : c));
  };

  const handleToggleStar = (chatId: string) => {
    setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, starred: !c.starred } : c));
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const commitRename = (chatId: string) => {
    const title = renameValue.trim();
    if (title) setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
    setRenamingId(null);
  };

  const handleRegenerate = () => {
    if (!activeChat) return;
    const lastUser = [...activeChat.messages].reverse().find(m => m.sender === 'user');
    if (!lastUser) return;
    // Remove the last bot reply, then resend the last user query
    setAllChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: c.messages.slice(0, -1) } : c));
    submitQuery(activeChat.id, lastUser.text, true);
  };

  const submitQuery = async (chatId: string, query: string, skipUserMsg = false) => {
    // Guest quota gate — 2 free messages, then sign-in is required
    if (!user && !canSend) {
      setApiError(`You've used your ${GUEST_LIMIT} free guest messages — sign in to keep chatting.`);
      setAuthModalOpen(true);
      return;
    }

    const chat = allChats.find(c => c.id === chatId) || { id: chatId, title: `New ${currentTabConfig.label} chat`, messages: [], mode: activeMainTab };
    const userMsg = { sender: 'user' as const, text: query, timestamp: new Date().toISOString() };
    const isDefaultTitle = chat.title.startsWith(`New ${currentTabConfig.label}`) || chat.title.startsWith(`${currentTabConfig.label} Chat`);
    const newTitle = isDefaultTitle && chat.messages.length === 0 && query.length > 0
      ? query.substring(0, 35) + (query.length > 35 ? '...' : '')
      : chat.title;

    if (!skipUserMsg) {
      setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle, messages: [...c.messages, userMsg] } : c));
    }
    setCurrentQueryForChat('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Unified mode: route by intent to the right engine
    const engine = isUnified ? detectIntent(query) : activeMainTab;
    if (isUnified && engine !== 'unified') {
      toast({ title: `Routed to ${engine === 'agent' ? 'AI Agent' : engine === 'search' ? 'AI Search' : 'AI Assistant'}`, description: 'The workspace picked the best engine for this.' });
    }

    setIsLoading(true);
    setApiError('');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Recent turns → conversational memory ("and what about X?" resolves correctly)
    const history = (chat.messages || [])
      .filter(m => !m.isError)
      .slice(-8)
      .map(m => ({ sender: m.sender, text: m.text }));
    const body = JSON.stringify({ query, model: modelTier, history });

    // Placeholder bot message — text accumulates as chunks arrive (real streaming)
    const botMsgBase = {
      sender: 'bot' as const,
      mode: engine,
      timestamp: new Date().toISOString(),
    };
    let botModel: string | undefined;
    setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, { ...botMsgBase, text: '' }] } : c));
    const updateBot = (text: string, model?: string) =>
      setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages.slice(0, -1), { ...botMsgBase, text, model: model || botModel }] } : c));
    const failBot = (msg: string) =>
      setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages.slice(0, -1), { ...botMsgBase, text: `Error: ${msg}`, isError: true }] } : c));
    const updateBotPending = (pending: Record<string, string | number>) =>
      setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages.slice(0, -1), { ...botMsgBase, text: '', pending }] } : c));

    try {
      const useStream = true; // all engines stream over SSE now (agent emits status + final)
      const res = await fetch(`${API_BASE_URL}/${engine}${useStream ? '/stream' : ''}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail;
        if (detail?.type === 'plan_limit') {
          const msg = `Daily limit of ${detail.limit} messages reached on the ${detail.plan} plan — upgrade at /pricing`;
          setApiError(msg);
          toast({ title: 'Plan limit reached', description: 'Upgrade your plan to keep chatting today.', variant: 'destructive' });
          failBot(msg);
          setIsLoading(false);
          return;
        }
        throw new Error(errData.response || detail || `HTTP ${res.status}`);
      }

      if (useStream && res.body) {
        // Read SSE stream — real token-by-token streaming
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let acc = '';
        let streamErr: string | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.meta) botModel = parsed.meta.model;
              else if (parsed.pending) updateBotPending(parsed.pending);
              else if (parsed.status) setAgentStatus(parsed.status);
              else if (parsed.error) streamErr = parsed.error;
              else if (parsed.delta) {
                acc += parsed.delta;
                updateBot(acc);
                scrollToBottom();
              }
            } catch { /* partial json */ }
          }
        }
        if (streamErr) throw new Error(streamErr);
        if (!acc) throw new Error('Empty response');
      } else {
        const data = await res.json();
        botModel = data.model;
        if (data.pending) updateBotPending(data.action);
        else updateBot(data.response || 'No response.', data.model);
      }

      if (!user) consumeGuestMessage();
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Error during request';
      setApiError(errMsg);
      failBot(errMsg);
    } finally {
      setIsLoading(false);
      setAgentStatus(null);
      if (textareaRef.current) textareaRef.current.focus();
    }
  };

  const handleSendMessageToChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = currentQueryForChat.trim();
    if (!query) {
      if (activeChat) setApiError('Please enter a message.');
      return;
    }
    if (!activeChat) {
      sendQuery(query);
    } else {
      submitQuery(activeChat.id, query);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage('Starting manual sync...');
    setApiError('');
    try {
      const res = await fetch(`${API_BASE_URL}/sync`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        throw new Error(errData.message || 'Sync failed');
      }
      const data = await res.json();
      setSyncMessage(`${data.message || 'Sync request sent.'}`);
      toast({
        title: "Sync started",
        description: data.message || 'Sync request sent successfully',
      });
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Sync failed';
      setSyncMessage(`Sync failed: ${errMsg}`);
      toast({
        title: "Sync failed",
        description: errMsg,
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 7000);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('GenAiWorkspaceTheme', next);
      return next;
    });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Text has been copied to your clipboard",
    });
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowScrollTip(scrollHeight - scrollTop - clientHeight > 100);
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const sidebar = (
    <div className="flex h-full w-72 flex-col border-r border-border bg-card">
      {/* Product identity */}
      <Link to="/" className="flex items-center gap-3 px-4 py-4 transition-opacity hover:opacity-80" title="GenAI Workspace — all products">
        <img src="/brand/ai-chip.png" alt={currentTabConfig.label} className="h-9 w-9 rounded-xl shadow-sm" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold tracking-tight">{currentTabConfig.label}</h1>
          <p className="truncate text-xs text-muted-foreground">{PRODUCT_TAGLINES[activeMainTab]}</p>
        </div>
      </Link>
      <div className="flex items-center px-4 pb-2 md:hidden">
        <Button variant="ghost" size="sm" className="ml-auto h-8 w-8 p-0" onClick={() => setSidebarOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* New chat */}
      <div className="px-3">
        <Button onClick={handleNewChat} className="w-full justify-start gap-2" size="sm">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Chat search */}
      <div className="mt-4 px-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={chatSearchTerm}
            onChange={e => setChatSearchTerm(e.target.value)}
            placeholder="Search chats"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Chat history */}
      <div className="mt-3 flex-1 overflow-y-auto px-3" style={{ scrollbarWidth: 'thin' }}>
        <div className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent {currentTabConfig.label} chats
        </div>
        {filteredChats.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">No chats yet — start a new one.</p>
        )}
        {filteredChats.map((chat, ci) => (
          <div
            key={chat.id}
            style={{ animationDelay: `${Math.min(ci * 30, 300)}ms` }}
            className={`animate-slide-in-left group mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              chat.id === activeChatId ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            }`}
            onClick={() => handleSelectChat(chat.id)}
          >
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            {renamingId === chat.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(chat.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(chat.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
                className="min-w-0 flex-1 rounded bg-muted px-1.5 py-0.5 text-sm outline-none ring-1 ring-blue-500/50"
              />
            ) : (
              <span
                className="min-w-0 flex-1 truncate"
                title="Double-click to rename"
                onDoubleClick={e => {
                  e.stopPropagation();
                  setRenamingId(chat.id);
                  setRenameValue(chat.title);
                }}
              >
                {chat.title}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); handleToggleStar(chat.id); }}
              className={`flex-shrink-0 rounded p-0.5 transition-colors ${chat.starred ? 'text-amber-500' : 'hidden text-muted-foreground hover:text-amber-500 group-hover:block'}`}
              title={chat.starred ? 'Unstar chat' : 'Star chat'}
            >
              <Star className={`h-3.5 w-3.5 ${chat.starred ? 'fill-amber-500' : ''}`} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteChat(chat.id); }}
              className="hidden flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
              title="Delete chat"
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer — account only */}
      <div className="border-t border-border px-3 py-3">
        <Link to="/reminders" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
          <Clock className="h-4 w-4" />
          Reminders
        </Link>
        {user ? (
          <div className="mt-1">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{user.name || user.email}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`rounded-full px-1.5 py-px font-semibold uppercase ${
                    user.plan === 'pro' ? 'bg-violet-500/15 text-violet-500' :
                    user.plan === 'plus' ? 'bg-blue-500/15 text-blue-500' :
                    'bg-muted'
                  }`}>{user.plan}</span>
                  <Link to="/pricing" className="hover:text-foreground hover:underline">upgrade</Link>
                </div>
              </div>
              <Link to="/settings" className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground" title="Settings">
                <SettingsIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : (
          <div className="mt-1 rounded-xl border border-border bg-accent/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold">Guest mode</div>
                <div className="text-[10px] text-muted-foreground">
                  {canSend ? `${messagesLeft} free message${messagesLeft === 1 ? '' : 's'} left` : 'Free messages used up'}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setAuthModalOpen(true)}
              size="sm"
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-xs text-white hover:opacity-90"
            >
              Sign in — it's free
            </Button>
            <p className="mt-2 text-center text-[10px] leading-tight text-muted-foreground">
              Syncs chats & unlocks all plans
            </p>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1">
          <Button onClick={toggleTheme} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" title="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            onClick={handleManualSync}
            variant="ghost"
            size="sm"
            disabled={isSyncing}
            className="ml-auto h-8 px-2 text-xs text-muted-foreground"
            title="Sync documents from Drive"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`${theme === 'dark' ? 'dark' : ''}`}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className="hidden md:block">{sidebar}</aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full">{sidebar}</div>
          </div>
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border px-4">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <currentTabConfig.icon className={`h-4 w-4 ${currentTabConfig.accent}`} />
              <span className="truncate text-sm font-medium">{activeChat?.title || currentTabConfig.label}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground sm:flex" title="Active model">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                gemini-3.1-flash-lite
              </span>
              {activeChat && activeChat.messages.length > 0 && (
                <Button onClick={handleClearMessagesInActiveChat} variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
                  <Trash className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              {user ? (
                <Button onClick={handleLogout} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" title="Sign out">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button onClick={() => setAuthModalOpen(true)} variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
                  Sign in
                </Button>
              )}
            </div>
          </header>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Aurora background */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className={`animate-aurora absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-gradient-to-br ${currentTabConfig.gradient} opacity-[0.07] blur-3xl`} />
              <div className="animate-aurora absolute -bottom-24 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-[0.05] blur-3xl" style={{ animationDelay: '-7s' }} />
            </div>
            <div className="relative mx-auto w-full max-w-3xl px-4 py-6">
              {activeChat && activeChat.messages.length > 0 ? (
                <div className="space-y-7">
                  {activeChat.messages.map((msg, index) => (
                    <MessageComponent
                      key={index}
                      msg={msg}
                      onCopy={handleCopyText}
                      currentTabConfig={currentTabConfig}
                      isLatest={index === activeChat.messages.length - 1}
                      onTyping={scrollToBottom}
                      msgIndex={index}
                      onFeedback={handleFeedback}
                      onRegenerate={handleRegenerate}
                      isStreaming={isLoading}
                      onApprove={msg.pending ? () => handleApproveAction(activeChat.id, index) : undefined}
                      onReject={msg.pending ? () => handleRejectAction(activeChat.id, index) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
                  {/* Icon — compact, subtle halo */}
                  <div className="animate-fade-up relative mb-4">
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${currentTabConfig.gradient} opacity-25 blur-lg`} />
                    <img src="/brand/ai-chip.png" alt="AI" className="relative h-12 w-12 rounded-xl shadow-md" />
                  </div>

                  <h2 className="animate-fade-up text-2xl font-semibold tracking-tight" style={{ animationDelay: '60ms' }}>
                    {greeting()}{user ? `, ${user.name?.split(' ')[0] || user.email.split('@')[0]}` : ''}
                  </h2>
                  <p className="animate-fade-up mt-3 max-w-md text-[15px] leading-6 text-muted-foreground" style={{ animationDelay: '120ms' }}>
                    {activeMainTab === 'search'
                      ? 'I can search across all your indexed documents instantly.'
                      : activeMainTab === 'agent'
                      ? 'Tell me what to do — I can create tasks, set reminders, schedule meetings and more.'
                      : activeMainTab === 'unified'
                      ? <>Ask about your <span className="font-medium text-blue-500">docs</span>, <span className="font-medium text-emerald-500">search</span> anything, or let me <span className="font-medium text-violet-500">act</span> — reminders, emails, tasks. I route each request to the right engine.</>
                      : 'Ask me anything about your documents — every answer comes with sources.'}
                  </p>

                  <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                    {SUGGESTIONS[activeMainTab].map((s, i) => {
                      const cfg = s.engine ? MAIN_TABS.find(t => t.id === s.engine) : currentTabConfig;
                      const Icon = cfg?.icon ?? currentTabConfig.icon;
                      const gradient = cfg?.gradient ?? currentTabConfig.gradient;
                      const borderHover = s.engine === 'search' ? 'hover:border-emerald-500/40' : s.engine === 'agent' ? 'hover:border-violet-500/40' : 'hover:border-blue-500/40';
                      return (
                        <button
                          key={i}
                          onClick={() => sendQuery(s.prompt)}
                          className={`animate-fade-up group flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 px-3 py-2.5 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 ${borderHover} hover:bg-accent/70 hover:shadow-md`}
                          style={{ animationDelay: `${200 + i * 80}ms` }}
                        >
                          <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} opacity-90`}>
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground/90">{s.title}</span>
                          <Send className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="mt-7 flex animate-fade-up items-start gap-3">
                  <img src="/brand/ai-chip.png" alt="AI" className="mt-0.5 h-7 w-7 animate-pulse-glow rounded-full" />
                  <div className="flex items-center gap-1.5 pt-2">
                    <div className="h-2 w-2 animate-bounce-dot rounded-full bg-muted-foreground/70" />
                    <div className="h-2 w-2 animate-bounce-dot rounded-full bg-muted-foreground/70" style={{ animationDelay: '0.15s' }} />
                    <div className="h-2 w-2 animate-bounce-dot rounded-full bg-muted-foreground/70" style={{ animationDelay: '0.3s' }} />
                    <span key={thinkingIdx} className="animate-fade-in ml-2 text-xs text-muted-foreground">
                      {agentStatus || (THINKING_PHRASES[activeMainTab] || THINKING_PHRASES.assistant)[thinkingIdx]}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Scroll to bottom */}
          {showScrollTip && (
            <Button
              onClick={scrollToBottom}
              className="fixed bottom-28 right-6 z-40 h-9 w-9 rounded-full border border-border bg-card p-0 shadow-lg"
              variant="ghost"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}

          {/* Composer */}
          <div className="relative z-10 flex-shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-4">
            {/* Guest banner — slim strip */}
            {!user && (
              <div className="mx-auto mb-2 flex w-full max-w-3xl animate-fade-up items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/[0.07] py-1.5 pl-3.5 pr-1.5">
                <Sparkles className="h-3 w-3 flex-shrink-0 text-blue-500" />
                <p className="min-w-0 flex-1 truncate text-[11px] text-foreground/75">
                  {canSend
                    ? <>Guest mode — <span className="font-semibold text-blue-500">{messagesLeft} free message{messagesLeft === 1 ? '' : 's'}</span> left</>
                    : <>Free messages used up — sign in to continue</>}
                </p>
                <Button size="sm" onClick={() => setAuthModalOpen(true)} className="h-6 flex-shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-3 text-[11px] hover:opacity-90">
                  Sign in
                </Button>
              </div>
            )}
            <div className="mx-auto w-full max-w-3xl">
              {apiError && (
                <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {apiError}
                </div>
              )}
              <form
                onSubmit={handleSendMessageToChat}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) uploadFile(f);
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
                />
                {uploading && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs text-foreground/80">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    Indexing {uploadName}…
                  </div>
                )}
                <div className={`rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 focus-within:shadow-lg focus-within:ring-4 ${
                  activeMainTab === 'search' ? 'focus-within:border-emerald-500/50 focus-within:ring-emerald-500/10' :
                  activeMainTab === 'agent' ? 'focus-within:border-violet-500/50 focus-within:ring-violet-500/10' :
                  'focus-within:border-blue-500/50 focus-within:ring-blue-500/10'
                }`}>
                  <Textarea
                    ref={textareaRef}
                    className="max-h-40 min-h-[52px] w-full resize-none border-0 bg-transparent p-3.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus-visible:ring-0"
                    placeholder={
                      activeMainTab === 'search' ? 'Search your documents…' :
                      activeMainTab === 'agent' ? 'Describe a task — e.g. "Add a task to call the client tomorrow"' :
                      'Ask anything…'
                    }
                    value={currentQueryForChat}
                    onChange={(e) => {
                      setCurrentQueryForChat(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessageToChat();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        title="Upload a document to index (PDF, DOCX, TXT, MD, CSV) — or drop a file here"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <div className="mx-0.5 h-4 w-px bg-border" />
                      {/* Model tier — inside the composer */}
                      <div className="flex items-center gap-0.5">
                        {MODEL_TIER_OPTIONS.map(t => {
                          const active = modelTier === t.id;
                          const locked = t.id === 'pro' && user?.plan !== 'pro';
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                if (locked) {
                                  toast({ title: 'Pro plan required', description: 'Upgrade to Pro to use the strongest model.', variant: 'destructive' });
                                  return;
                                }
                                setModelTier(t.id);
                                localStorage.setItem('GenAiModelTier', t.id);
                              }}
                              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                                active
                                  ? 'bg-foreground/10 text-foreground'
                                  : locked
                                    ? 'text-muted-foreground/50 hover:text-muted-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                              }`}
                              title={t.id === 'pro' ? (locked ? 'Pro plan required' : 'Strongest model') : t.id === 'auto' ? 'Picks speed or quality per request' : t.id === 'lite' ? 'Fastest responses' : 'Better reasoning'}
                            >
                              <t.icon className="h-3 w-3" />
                              {t.label}
                              {locked && <Lock className="h-2.5 w-2.5" />}
                            </button>
                          );
                        })}
                      </div>
                      <span className="ml-1 hidden text-[10px] text-muted-foreground/60 sm:inline">
                        {user?.usage?.limit ? `${user.usage.used}/${user.usage.limit} today` : 'Enter to send'}
                      </span>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isLoading || !currentQueryForChat.trim()}
                      className={`h-8 w-8 rounded-lg bg-gradient-to-r p-0 ${currentTabConfig.gradient} disabled:opacity-40`}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </form>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {currentTabConfig.label} can make mistakes — verify important information.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ClearConfirmModal
        showClearConfirm={showClearConfirm}
        confirmClearChat={confirmClearChat}
        cancelClearChat={cancelClearChat}
      />

      <AuthModal />

      {/* Signing-out overlay */}
      {signingOut && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="animate-fade-up flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-10 py-8 shadow-2xl">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${currentTabConfig.gradient}`}>
              <LogOut className="h-5 w-5 animate-pulse text-white" />
            </div>
            <div className="text-sm font-medium">Signing you out…</div>
            <div className="flex gap-1.5">
              <div className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-muted-foreground" />
              <div className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-muted-foreground" style={{ animationDelay: '0.15s' }} />
              <div className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-muted-foreground" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Sync message */}
      {syncMessage && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm shadow-lg">
          {syncMessage}
        </div>
      )}
    </div>
  );
};

export default Index;
