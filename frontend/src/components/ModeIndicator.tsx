
import React from 'react';

interface ModeIndicatorProps {
  size?: 'small' | 'medium';
  activeMainTab: string;
  MAIN_TABS?: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<any>;
  }>;
}

export const ModeIndicator: React.FC<ModeIndicatorProps> = ({ 
  size = 'medium', 
  activeMainTab,
  MAIN_TABS = []
}) => {
  const iconSize = size === 'small' ? 'w-4 h-4' : 'w-6 h-6';
  const textSize = size === 'small' ? 'text-xs' : 'text-sm';

  const currentTab = MAIN_TABS.find(t => t.id === activeMainTab);
  const IconComponent = currentTab?.icon;

  return (
    <div className={`flex items-center space-x-2 ${textSize}`}>
      {IconComponent && <IconComponent className={`inline ${iconSize}`} />}
      <span className="font-semibold">{currentTab?.label}</span>
    </div>
  );
};
