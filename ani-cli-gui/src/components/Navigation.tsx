import { Search, History, Settings } from 'lucide-react'

export function Navigation({
  activeTab,
  setActiveTab
}: {
  activeTab: string,
  setActiveTab: (val: string) => void
}) {
  return (
    <nav className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-m3-surface-container/80 backdrop-blur-xl border border-m3-outline/20 rounded-[32px] p-2 flex space-x-2 z-50">
      <button 
        onClick={() => setActiveTab('search')}
        className={`px-6 py-3 rounded-full flex items-center space-x-2 font-medium transition-all ${activeTab === 'search' ? 'bg-m3-primary text-m3-on-primary font-black' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <Search size={20} />
        <span>Browse</span>
      </button>
      <button 
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 rounded-full flex items-center space-x-2 font-medium transition-all ${activeTab === 'history' ? 'bg-m3-primary text-m3-on-primary font-black' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <History size={20} />
        <span>History</span>
      </button>
      <button 
          onClick={() => setActiveTab('settings')}
          className={`px-6 py-3 rounded-full flex items-center space-x-2 font-medium transition-all ${activeTab === 'settings' ? 'bg-m3-primary text-m3-on-primary font-black' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <Settings size={20} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
