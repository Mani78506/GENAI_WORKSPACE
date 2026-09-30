
import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ClearConfirmModalProps {
  showClearConfirm: boolean;
  confirmClearChat: () => void;
  cancelClearChat: () => void;
}

export const ClearConfirmModal: React.FC<ClearConfirmModalProps> = ({
  showClearConfirm,
  confirmClearChat,
  cancelClearChat
}) => {
  return (
    <Dialog open={showClearConfirm} onOpenChange={cancelClearChat}>
      <DialogContent className="bg-slate-800 border-slate-600 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Confirm Clear</DialogTitle>
          <DialogDescription className="text-slate-300">
            Are you sure you want to clear all messages in this chat? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-end space-x-3 mt-6">
          <Button 
            variant="outline"
            onClick={cancelClearChat}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearChat}
            className="bg-red-600 hover:bg-red-700"
          >
            Clear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
