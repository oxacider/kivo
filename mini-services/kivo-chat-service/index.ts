import { createServer } from 'http'
import { Server } from 'socket.io'
import { db } from '../../src/lib/db'
import * as jose from 'jose'

// ---------------------------------------------------------------------------
// JWT Verification (shared secret with main app)
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters')
}
const secretKey = new TextEncoder().encode(JWT_SECRET)

async function verifySocketToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey, { algorithms: ['HS256'] })
    return (payload as { userId?: string }).userId ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// HTTP + Socket.IO server
// ---------------------------------------------------------------------------

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------------------------------------------------------------------------
// Online-users tracking
// ---------------------------------------------------------------------------

/** userId → socketId */
const onlineUsers = new Map<string, string>()
/** socketId → userId */
const socketToUser = new Map<string, string>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getConversation(convId: string) {
  return db.conversation.findUnique({ where: { id: convId } })
}

function isParticipant(conv: { user1Id: string; user2Id: string } | null, userId: string): boolean {
  if (!conv) return false
  return conv.user1Id === userId || conv.user2Id === userId
}

function getOtherUserId(conv: { user1Id: string; user2Id: string }, myUserId: string): string {
  return conv.user1Id === myUserId ? conv.user2Id : conv.user1Id
}

async function isBlocked(userId1: string, userId2: string): Promise<boolean> {
  const count = await db.block.count({
    where: {
      OR: [
        { blockerId: userId1, blockedId: userId2 },
        { blockerId: userId2, blockedId: userId1 },
      ],
    },
  })
  return count > 0
}

function emitToUser(userId: string, event: string, data: unknown) {
  const socketId = onlineUsers.get(userId)
  if (socketId) {
    io.to(socketId).emit(event, data)
  }
}

async function getSenderInfo(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, avatar: true },
  })
  return user
}

// ---------------------------------------------------------------------------
// Socket authentication middleware
// ---------------------------------------------------------------------------

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    return next(new Error('Authentication required'))
  }

  const userId = await verifySocketToken(token)
  if (!userId) {
    return next(new Error('Invalid or expired token'))
  }

  // Verify user exists in DB
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return next(new Error('User not found'))
  }

  // Attach userId to socket data
  socket.data.userId = userId
  next()
})

// ---------------------------------------------------------------------------
// Socket connection handler
// ---------------------------------------------------------------------------

io.on('connection', async (socket) => {
  const userId: string = socket.data.userId
  console.log(`[socket] authenticated: ${userId} (${socket.id})`)

  // Track online
  onlineUsers.set(userId, socket.id)
  socketToUser.set(socket.id, userId)
  await db.user.update({
    where: { id: userId },
    data: { online: true, lastSeen: new Date() },
  })

  socket.emit('auth:success', { userId })
  console.log(`[auth] ${userId} is now online (${onlineUsers.size} total)`)

  // -----------------------------------------------------------------------
  // message:send – save message to DB & deliver to recipient
  // -----------------------------------------------------------------------
  socket.on(
    'message:send',
    async ({
      conversationId,
      content,
      type,
      replyToId,
    }: {
      conversationId: string
      content: string
      type?: string
      replyToId?: string
    }) => {
      try {
        // Validate conversation membership
        const conv = await getConversation(conversationId)
        if (!isParticipant(conv, userId)) return

        // Validate no block between participants
        const otherId = getOtherUserId(conv, userId)
        if (await isBlocked(userId, otherId)) return

        // Validate content
        if (!content || typeof content !== 'string' || content.length > 10000) return

        const message = await db.message.create({
          data: {
            conversationId,
            senderId: userId,
            content,
            type: type ?? 'text',
            replyToId: replyToId ?? null,
          },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
            replyTo: {
              select: { id: true, content: true },
            },
          },
        })

        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })

        emitToUser(otherId, 'message:new', message)
        socket.emit('message:new', message)
      } catch (err) {
        console.error('[message:send] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:edit
  // -----------------------------------------------------------------------
  socket.on(
    'message:edit',
    async ({ messageId, content }: { messageId: string; content: string }) => {
      try {
        const msg = await db.message.findUnique({ where: { id: messageId } })
        if (!msg || msg.senderId !== userId || msg.deleted) return

        // Verify sender is still a participant
        const conv = await getConversation(msg.conversationId)
        if (!isParticipant(conv, userId)) return

        const updated = await db.message.update({
          where: { id: messageId, senderId: userId, deleted: false },
          data: { content, edited: true, updatedAt: new Date() },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
          },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:updated', updated)
        socket.emit('message:updated', updated)
      } catch (err) {
        console.error('[message:edit] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:delete
  // -----------------------------------------------------------------------
  socket.on(
    'message:delete',
    async ({ messageId }: { messageId: string }) => {
      try {
        const msg = await db.message.findUnique({ where: { id: messageId } })
        if (!msg || msg.senderId !== userId) return

        const conv = await getConversation(msg.conversationId)
        if (!isParticipant(conv, userId)) return

        await db.message.update({
          where: { id: messageId },
          data: { deleted: true, content: '', updatedAt: new Date() },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:deleted', { messageId, conversationId: msg.conversationId })
        socket.emit('message:deleted', { messageId, conversationId: msg.conversationId })
      } catch (err) {
        console.error('[message:delete] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:read
  // -----------------------------------------------------------------------
  socket.on(
    'message:read',
    async ({ conversationId }: { conversationId: string }) => {
      try {
        const conv = await getConversation(conversationId)
        if (!isParticipant(conv, userId)) return

        await db.message.updateMany({
          where: { conversationId, senderId: { not: userId }, status: { not: 'read' } },
          data: { status: 'read' },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:read', { conversationId, userId })
      } catch (err) {
        console.error('[message:read] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // typing:start / typing:stop
  // -----------------------------------------------------------------------
  socket.on(
    'typing:start',
    async ({ conversationId }: { conversationId: string }) => {
      const conv = await getConversation(conversationId)
      if (!isParticipant(conv, userId)) return
      const otherId = getOtherUserId(conv, userId)
      emitToUser(otherId, 'user:typing', { conversationId, userId, isTyping: true })
    },
  )

  socket.on(
    'typing:stop',
    async ({ conversationId }: { conversationId: string }) => {
      const conv = await getConversation(conversationId)
      if (!isParticipant(conv, userId)) return
      const otherId = getOtherUserId(conv, userId)
      emitToUser(otherId, 'user:typing', { conversationId, userId, isTyping: false })
    },
  )

  // -----------------------------------------------------------------------
  // user:status
  // -----------------------------------------------------------------------
  socket.on(
    'user:status',
    async ({ status }: { status: string }) => {
      try {
        await db.user.update({ where: { id: userId }, data: { status } })
        io.emit('user:status-change', { userId, status })
      } catch (err) {
        console.error('[user:status] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------
  socket.on('disconnect', async () => {
    onlineUsers.delete(userId)
    socketToUser.delete(socket.id)

    try {
      await db.user.update({
        where: { id: userId },
        data: { online: false, lastSeen: new Date() },
      })
    } catch (err) {
      console.error('[disconnect] failed to update user', err)
    }

    io.emit('user:offline', { userId })
    console.log(`[disconnect] ${userId} went offline (${onlineUsers.size} still online)`)
  })

  socket.on('error', (error) => {
    console.error(`[socket] error (${socket.id}):`, error)
  })
})

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[kivo-chat-service] Socket.IO server running on port ${PORT}`)
})

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string) {
  console.log(`[kivo-chat-service] received ${signal}, shutting down...`)
  io.close()
  httpServer.close(() => {
    console.log('[kivo-chat-service] server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
