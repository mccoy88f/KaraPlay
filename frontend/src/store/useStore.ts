import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  nickname: string
  email?: string
  role: 'guest' | 'user' | 'admin'
}

export interface Event {
  id: string
  name: string
  location: string
  date: string
  status: 'DRAFT' | 'OPEN' | 'LIVE' | 'ENDED'
  joinCode: string
}

export interface Song {
  id: string
  title: string
  artist: string
  source: 'MIDI' | 'YOUTUBE'
  duration?: number
  midiPath?: string
  lrcPath?: string
  mp3Path?: string
}

export interface Booking {
  id: string
  eventId: string
  userId: string
  songId?: string
  ytUrl?: string
  ytTitle?: string
  ytLrcFound?: boolean
  position: number
  status: string
  user: { id: string; nickname: string }
  song?: Song
}

export interface Performance {
  id: string
  eventId: string
  bookingId: string
  userId: string
  startedAt?: string
  endedAt?: string
  scoreTotal?: number
  votesAvg?: number
  commentsCount: number
  bonusEngagement?: number
}

export interface Comment {
  id?: string
  text: string
  emoji?: string
  createdAt: string
  user: { id: string; nickname: string }
}

export interface LeaderboardEntry {
  user: { id: string; nickname: string }
  avgScore: number
  performances: number
  bestScore?: number
}

interface AppState {
  token: string | null
  user: User | null
  currentEvent: Event | null
  queue: Booking[]
  currentPerformance: Performance | null
  currentSong: Song | null
  currentBooking: Booking | null
  comments: Comment[]
  leaderboard: LeaderboardEntry[]
  votesData: { avg: number; count: number; distribution: { value: number; count: number }[] } | null

  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  setCurrentEvent: (event: Event | null) => void
  setQueue: (queue: Booking[]) => void
  setCurrentPerformance: (p: Performance | null) => void
  setCurrentSong: (s: Song | null) => void
  setCurrentBooking: (b: Booking | null) => void
  addComment: (c: Comment) => void
  clearComments: () => void
  setLeaderboard: (l: LeaderboardEntry[]) => void
  setVotesData: (v: AppState['votesData']) => void
  logout: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      currentEvent: null,
      queue: [],
      currentPerformance: null,
      currentSong: null,
      currentBooking: null,
      comments: [],
      leaderboard: [],
      votesData: null,

      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setCurrentEvent: (currentEvent) => set({ currentEvent }),
      setQueue: (queue) => set({ queue }),
      setCurrentPerformance: (currentPerformance) => set({ currentPerformance }),
      setCurrentSong: (currentSong) => set({ currentSong }),
      setCurrentBooking: (currentBooking) => set({ currentBooking }),
      addComment: (c) => set((s) => ({ comments: [...s.comments.slice(-50), c] })),
      clearComments: () => set({ comments: [] }),
      setLeaderboard: (leaderboard) => set({ leaderboard }),
      setVotesData: (votesData) => set({ votesData }),
      logout: () => set({ token: null, user: null, currentEvent: null }),
    }),
    {
      name: 'kk-storage',
      partialize: (s) => ({ token: s.token, user: s.user, currentEvent: s.currentEvent }),
    }
  )
)
