import { FastifyInstance } from 'fastify'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}
