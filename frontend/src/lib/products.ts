import { Lightbulb, Search, Cpu, Bot } from 'lucide-react';

export const UNIFIED = {
  id: 'unified',
  label: 'GenAI Workspace',
  icon: Bot,
  apiEndpoint: 'assistant',
  gradient: 'from-blue-500 to-indigo-600',
  accent: 'text-blue-500',
  description: 'Ask anything — the workspace routes it to the right engine automatically.',
};

export const MAIN_TABS = [
  {
    id: 'assistant',
    label: 'AI Assistant',
    icon: Lightbulb,
    apiEndpoint: 'assistant',
    gradient: 'from-blue-500 to-indigo-600',
    accent: 'text-blue-500',
    description: 'Ask anything in plain English — it reads your uploaded documents and answers like a teammate who knows your company.',
  },
  {
    id: 'search',
    label: 'AI Search',
    icon: Search,
    apiEndpoint: 'search',
    gradient: 'from-emerald-500 to-teal-600',
    accent: 'text-emerald-500',
    description: 'Semantic search across every policy and doc — finds the answer even when you don\'t know the exact wording.',
  },
  {
    id: 'agent',
    label: 'AI Agent',
    icon: Cpu,
    apiEndpoint: 'agent',
    gradient: 'from-violet-500 to-purple-600',
    accent: 'text-violet-500',
    description: 'A working agent, not a chatbot — it creates todos, sends emails, books meetings and sets reminders for you.',
  },
];

export const SUGGESTIONS: Record<string, { title: string; prompt: string; engine?: 'assistant' | 'search' | 'agent' }[]> = {
  unified: [
    { title: 'Leave policy at TechNova', prompt: 'What is the leave policy at TechNova?', engine: 'assistant' },
    { title: 'Find password rules', prompt: 'Search for password complexity requirements', engine: 'search' },
    { title: 'Set a reminder', prompt: 'Remind me to check reports at 5 PM', engine: 'agent' },
    { title: 'Create a task', prompt: 'Add a task to call the client tomorrow at 10 AM', engine: 'agent' },
  ],
  assistant: [
    { title: 'Leave policy at TechNova', prompt: 'What is the leave policy at TechNova?' },
    { title: 'Password requirements', prompt: 'Summarize the password requirements' },
    { title: 'What can you search?', prompt: 'What documents can you search?' },
    { title: 'Draft a summary', prompt: 'Summarize the key points across all policy documents' },
  ],
  search: [
    { title: 'Remote work policy', prompt: 'Find the remote work policy' },
    { title: 'Leave approval steps', prompt: 'Look up leave approval steps' },
    { title: 'Security requirements', prompt: 'Search for security requirements' },
    { title: 'Compare policies', prompt: 'Compare policies across the indexed documents' },
  ],
  agent: [
    { title: 'Create a task', prompt: 'Add a task to call the client tomorrow at 10 AM' },
    { title: 'Set a reminder', prompt: 'Remind me to check reports at 5 PM' },
    { title: 'Schedule a meeting', prompt: 'Schedule a meeting titled Team Sync tomorrow at 3 PM' },
    { title: 'Web research', prompt: 'Search the web for the latest AI tools' },
  ],
};
