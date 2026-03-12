import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useStore } from '../store/useStore'

const WS_URL = import.meta.env.VITE_WS_URL || ''

let globalSocket: Socket | null = null

export function useSocket(options?: { role?: string; onConnect?: () => void }) {
  const { token, user, currentEvent } = useStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!currentEvent) return

    if (!globalSocket || !globalSocket.connected) {
      globalSocket = io(WS_URL, {
        auth: {
          token,
          eventId: currentEvent.id,
          role: user?.role || 'guest',
        },
        transports: ['websocket', 'polling'],
      })
    }

    socketRef.current = globalSocket

    if (options?.role === 'display') {
      globalSocket.emit('display:ready')
    } else if (options?.role === 'stage') {
      globalSocket.emit('stage:ready')
    }

    if (options?.onConnect) {
      globalSocket.on('connect', options.onConnect)
    }

    return () => {
      if (options?.onConnect) {
        globalSocket?.off('connect', options.onConnect)
      }
    }
  }, [currentEvent?.id, token])

  return socketRef.current || globalSocket
}

export function getSocket() {
  return globalSocket
}
