import { useEffect, useState } from 'react'
import { useStore } from '../../../store/useStore'
import LeaderboardWidget from '../../../components/Leaderboard/LeaderboardWidget'
import api from '../../../api/client'
import { LeaderboardEntry } from '../../../store/useStore'

export default function LeaderboardTab() {
  const { currentEvent, leaderboard, user } = useStore()
  const [globalLb, setGlobalLb] = useState<LeaderboardEntry[]>([])
  const [activeTab, setActiveTab] = useState<'event' | 'global'>('event')

  useEffect(() => {
    api.get('/leaderboard/global').then((r) => setGlobalLb(r.data))
  }, [])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-yellow-400">🏆 Classifica</h2>

      <div className="flex gap-1 bg-dark-600 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('event')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'event' ? 'bg-brand-600 text-white' : 'text-gray-400'}`}
        >
          Questa Serata
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'global' ? 'bg-brand-600 text-white' : 'text-gray-400'}`}
        >
          Globale
        </button>
      </div>

      <LeaderboardWidget
        entries={activeTab === 'event' ? leaderboard : globalLb}
        currentUserId={user?.id}
      />
    </div>
  )
}
