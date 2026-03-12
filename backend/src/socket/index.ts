import { Server, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'

export function setupSocket(io: Server, prisma: PrismaClient) {
  io.on('connection', (socket: Socket) => {
    const { eventId, role } = socket.handshake.auth

    if (eventId) {
      socket.join(`event:${eventId}`)
    }

    // Display screen connected
    socket.on('display:ready', () => {
      if (eventId) {
        socket.join(`display:${eventId}`)
        socket.broadcast.to(`admin:${eventId}`).emit('display:connected')
      }
    })

    // Stage screen connected
    socket.on('stage:ready', () => {
      if (eventId) {
        socket.join(`stage:${eventId}`)
      }
    })

    // Admin connected
    if (role === 'admin' && eventId) {
      socket.join(`admin:${eventId}`)
    }

    // Comment from client
    socket.on('comment:send', async (data: { text: string; emoji?: string; performanceId: string; userId: string; nickname: string }) => {
      // Broadcast to all in event
      io.to(`event:${eventId}`).emit('comment:new', {
        comment: { text: data.text, emoji: data.emoji, createdAt: new Date() },
        user: { id: data.userId, nickname: data.nickname },
      })
    })

    // Vote from client
    socket.on('vote:cast', async (data: { value: number; performanceId: string }) => {
      // Handled via REST — socket just for real-time feedback
    })

    socket.on('disconnect', () => {
      // Cleanup if needed
    })
  })
}
