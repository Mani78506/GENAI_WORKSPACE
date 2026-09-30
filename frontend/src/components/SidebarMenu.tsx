
import React from 'react';
import { Search, Trash } from 'lucide-react';
import type { Chat } from '@/types/chat';

interface SidebarMenuProps {
  chatSearchTerm: string;
  setChatSearchTerm: (term: string) => void;
  filteredChats: Chat[];
  activeMainTab: string;
  setActiveMainTab: (tab: string) => void;
  setPopupOpen: (open: boolean) => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  MAIN_TABS: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<any>;
    gradient: string;
  }>;
}

export const SidebarMenu: React.FC<SidebarMenuProps> = ({
  chatSearchTerm,
  setChatSearchTerm,
  filteredChats,
  activeMainTab,
  setActiveMainTab,
  setPopupOpen,
  handleSelectChat,
  handleDeleteChat,
  MAIN_TABS
}) => {
  return (
    <div className="absolute right-0 top-12 w-80 bg-slate-800/95 border border-slate-600/50 rounded-2xl shadow-2xl z-50 p-6 backdrop-blur-sm animate-fadeIn popup-menu">
      {/* Search */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="search"
          placeholder="Search chats..."
          className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          value={chatSearchTerm}
          onChange={(e) => setChatSearchTerm(e.target.value)}
        />
      </div>

      {/* Mode Switcher */}
      <div className="mb-6">
        <h4 className="text-xs uppercase font-semibold text-slate-400 mb-3 tracking-wider">AI Modes</h4>
        <div className="space-y-1">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveMainTab(tab.id);
                setPopupOpen(false);
              }}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 text-sm ${
                activeMainTab === tab.id
                  ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                  : 'hover:bg-slate-700/50 text-slate-300 hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-3" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat List */}
      <div>
        <h4 className="text-xs uppercase font-semibold text-slate-400 mb-3 tracking-wider">
          Recent Chats ({filteredChats.length})
        </h4>
        <div className="max-h-64 overflow-y-auto space-y-2" style={{ scrollbarWidth: 'thin' }}>
          {filteredChats
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((chat) => (
              <div key={chat.id} className="group flex items-center justify-between p-3 hover:bg-slate-700/50 rounded-xl transition-colors">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    handleSelectChat(chat.id);
                    setPopupOpen(false);
                  }}
                >
                  <div className="text-sm text-white truncate mb-1">{chat.title}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(chat.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-slate-600/50 rounded-lg transition-all"
                  onClick={() => handleDeleteChat(chat.id)}
                  aria-label="Delete chat"
                >
                  <Trash className="h-4 w-4 text-red-400" />
                </button>
              </div>
            ))}
          {filteredChats.length === 0 && (
            <div className="text-center py-8">
              <div className="text-slate-500 text-sm">
                {chatSearchTerm ? 'No matching chats found' : 'No chats yet'}
              </div>
              <div className="text-slate-600 text-xs mt-1">
                {chatSearchTerm ? 'Try a different search term' : 'Start a new conversation'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
