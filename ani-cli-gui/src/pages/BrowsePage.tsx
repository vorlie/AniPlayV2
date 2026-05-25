import { Search, MonitorPlay } from 'lucide-react'

export function BrowsePage({
  searchQuery,
  setSearchQuery,
  results,
  setResults,
  onSelectAnime
}: {
  searchQuery: string,
  setSearchQuery: (val: string) => void,
  results: any[],
  setResults: (val: any[]) => void,
  onSelectAnime: (anime: any) => void
}) {
  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="m3-card p-6 flex flex-col space-y-4">
        <h2 className="font-tempo text-2xl text-m3-on-surface">Find Anime</h2>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search an anime title..." 
            className="w-full bg-m3-on-surface/5 border border-m3-outline/20 rounded-2xl pl-12 pr-4 py-3 text-m3-on-surface focus:outline-none focus:ring-2 focus:ring-m3-primary/30 focus:border-m3-primary/50 transition-all font-sans"
            value={searchQuery}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // @ts-ignore
                window.ipcRenderer.invoke('search', searchQuery).then((res: any) => {
                  if (res.success) setResults(res.data)
                })
              }
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-m3-outline" size={20} />
        </div>
        <button 
          onClick={() => {
            // @ts-ignore
            window.ipcRenderer.invoke('search', searchQuery).then((res: any) => {
              if (res.success) setResults(res.data)
            })
          }}
          className="bg-m3-primary text-m3-on-primary font-black rounded-full px-6 py-3 shadow-sm hover:shadow-md transition-all self-start flex items-center space-x-2">
          <MonitorPlay size={20} />
          <span>Search</span>
        </button>
      </div>

      <div className="m3-card p-6 flex-1 min-h-[300px]">
        <h3 className="text-xl font-bold mb-4 opacity-80 border-b border-m3-outline/20 pb-2">Results</h3>
        {results && results.length > 0 ? (
          <div className="flex flex-col space-y-2 overflow-y-auto max-h-[500px] pr-2">
            {results.map((anime: any) => (
              <div 
                key={anime.id} 
                className="p-3 m3-card-hover rounded-xl border border-transparent cursor-pointer flex justify-between items-center group"
                onClick={() => onSelectAnime(anime)}
              >
                <span className="font-bold text-m3-on-surface group-hover:text-m3-primary transition-colors">{anime.name}</span>
                <span className="text-sm bg-m3-primary/10 text-m3-primary px-3 py-1 rounded-full">{anime.episodes} eps</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full opacity-50">
            <p>Enter a search query to load anime.</p>
          </div>
        )}
      </div>
    </div>
  )
}
