import Fastify from 'fastify'
import { Server } from 'socket.io'
import { createServer } from 'http'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { setupSocket } from './socket'
import authRoutes from './routes/auth'
import eventRoutes from './routes/events'
import songRoutes from './routes/songs'
import bookingRoutes from './routes/bookings'
import performanceRoutes from './routes/performances'
import voteRoutes from './routes/votes'
import commentRoutes from './routes/comments'
import youtubeRoutes from './routes/youtube'
import mediaRoutes from './routes/media'
import leaderboardRoutes from './routes/leaderboard'

export const prisma = new PrismaClient()

async function main() {
  const fastify = Fastify({ logger: true })
  const httpServer = createServer(fastify.server)

  // Socket.io setup
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  setupSocket(io, prisma)
  fastify.decorate('io', io)

  // Plugins
  await fastify.register(cors, { origin: true })
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'fallback_secret',
  })
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  await fastify.register(fastifyStatic, {
    root: process.env.STORAGE_PATH || path.join(__dirname, '../storage'),
    prefix: '/storage/',
  })

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(eventRoutes, { prefix: '/api' })
  await fastify.register(songRoutes, { prefix: '/api' })
  await fastify.register(bookingRoutes, { prefix: '/api' })
  await fastify.register(performanceRoutes, { prefix: '/api' })
  await fastify.register(voteRoutes, { prefix: '/api' })
  await fastify.register(commentRoutes, { prefix: '/api' })
  await fastify.register(youtubeRoutes, { prefix: '/api' })
  await fastify.register(mediaRoutes, { prefix: '/api' })
  await fastify.register(leaderboardRoutes, { prefix: '/api' })

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }))

  try {
    await fastify.ready()
    httpServer.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        fastify.log.error(err)
        process.exit(1)
      }
      fastify.log.info(`Server listening on ${address}`)
    })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

main()
