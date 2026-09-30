
import React from 'react';
import { ExternalLink, Copy, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
  date?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onCopy: (text: string) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ results, onCopy }) => {
  if (!results || !results.length) return null;

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-600/50 backdrop-blur-sm">
      <div className="flex items-center mb-4">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center mr-3">
          <ExternalLink className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-200">
          Search Results ({results.length})
        </span>
      </div>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {results.map((result, index) => (
          <div key={index} className="bg-slate-700/50 rounded-xl p-4 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 group">
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-sm font-semibold text-white line-clamp-2 flex-1 pr-2">
                {result.title}
              </h4>
              <Button
                onClick={() => onCopy(result.url)}
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 p-0 hover:bg-slate-600/50"
                title="Copy URL"
              >
                <Copy className="w-3 h-3 text-slate-400" />
              </Button>
            </div>
            
            <p className="text-xs text-slate-300 mb-3 line-clamp-3 leading-relaxed">
              {result.snippet}
            </p>
            
            <div className="flex items-center justify-between">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 truncate flex items-center transition-colors group"
              >
                <ExternalLink className="w-3 h-3 mr-1 group-hover:scale-110 transition-transform" />
                <span className="truncate">
                  {result.domain || new URL(result.url).hostname}
                </span>
              </a>
              
              {result.date && (
                <span className="text-xs text-slate-500 flex items-center ml-2">
                  <Calendar className="w-3 h-3 mr-1" />
                  {result.date}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
