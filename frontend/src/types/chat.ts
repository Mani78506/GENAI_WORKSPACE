
export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  mode: string;
  starred?: boolean;
  createdAt: string;
}

export interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  mode?: string;
  isError?: boolean;
  animate?: boolean;
  feedback?: 'like' | 'dislike' | null;
  model?: string;
  pending?: Record<string, string | number> | null; // action awaiting user approval
  searchResults?: SearchResult[] | null;
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
  date?: string;
}
