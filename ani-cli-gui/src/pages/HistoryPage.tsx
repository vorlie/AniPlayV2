import { useEffect, useState } from 'react'
import { History, Play, Trash2 } from 'lucide-react'
import { clearHistory, readHistory, type HistoryEntry } from '../lib/history'

export function HistoryPage({
  onResume
}: {
  onResume: (item: HistoryEntry) => void
}) {
  const [items, setItems] = useState<HistoryEntry[]>([])

  const refresh = () => setItems(readHistory())

  useEffect(() => {
    refresh()
  }, [])

  const handleClear = () => {
    clearHistory()
    refresh()
  }

  return (
    <div className="flex-1 space-y-6 min-h-0">
      <div className="m3-card p-5 md:p-6 flex flex-col space-y-4 relative overflow-hidden group max-w-4xl mx-auto w-full min-h-[280px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2 text-m3-primary">
            <History size={20} />
            <h2 className="font-tempo text-xl font-medium">Watch History</h2>
          </div>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-lg border border-m3-outline/20 text-xs text-m3-on-surface-variant hover:bg-m3-on-surface/10 flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
        
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-m3-on-surface-variant">
            No history yet. Start watching an episode and it will appear here.
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={`${item.animeId}:${item.episode}:${item.watchedAt}:${idx}`} className="rounded-xl border border-m3-outline/15 bg-m3-surface-container/40 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-m3-on-surface truncate">{item.animeName}</p>
                  <p className="text-xs text-m3-on-surface-variant">
                    Episode {item.episode} · {new Date(item.watchedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => onResume(item)}
                  className="shrink-0 px-3 py-2 rounded-lg bg-m3-primary text-m3-on-primary text-xs font-bold flex items-center gap-1.5"
                >
                  <Play size={14} />
                  Resume
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
