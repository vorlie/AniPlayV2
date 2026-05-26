import { Search, History, Settings } from 'lucide-react'

export function Navigation({
  activeTab,
  setActiveTab,
  className = ''
}: {
  activeTab: string,
  setActiveTab: (val: string) => void,
  className?: string
}) {
  return (
    <nav className={`bg-m3-surface-container/80 backdrop-blur-xl border border-m3-outline/20 rounded-2xl p-1.5 flex items-center gap-1.5 ${className}`} style={{ WebkitAppRegion: 'no-drag' } as any}>
      <button 
        onClick={() => setActiveTab('search')}
        className={`px-3 md:px-4 py-2 rounded-xl flex items-center space-x-1.5 text-sm font-semibold transition-all ${activeTab === 'search' ? 'bg-m3-primary text-m3-on-primary shadow-sm' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <Search size={16} />
        <span>Browse</span>
      </button>
      <button 
          onClick={() => setActiveTab('history')}
          className={`px-3 md:px-4 py-2 rounded-xl flex items-center space-x-1.5 text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-m3-primary text-m3-on-primary shadow-sm' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <History size={16} />
        <span>History</span>
      </button>
      <button 
          onClick={() => setActiveTab('settings')}
          className={`px-3 md:px-4 py-2 rounded-xl flex items-center space-x-1.5 text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-m3-primary text-m3-on-primary shadow-sm' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}>
        <Settings size={16} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
