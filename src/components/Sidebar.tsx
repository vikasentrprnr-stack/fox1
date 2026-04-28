import { useState } from 'react';
import { Home, Image as ImageIcon, Settings, Menu, X, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export function Sidebar({ currentTab, setCurrentTab }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    { id: 'chat', label: 'Fox AI Chat', icon: Home },
    { id: 'clustering', label: 'Image Clustering', icon: ImageIcon },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navigate = (id: string) => {
    setCurrentTab(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 text-white rounded-md shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-[#0a0a0a] border-r border-[#1f1f1f] text-white transition-transform duration-300 ease-in-out md:translate-x-0 md:static",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center space-x-3 mb-8 px-2 pt-2 md:pt-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg">
              F
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Fox AI</h1>
          </div>

          <nav className="flex-1 space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.id)}
                  className={cn(
                    "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-sm",
                    currentTab === tab.id 
                      ? "bg-[#1f1f1f] text-white shadow-sm" 
                      : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                  )}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>


        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
