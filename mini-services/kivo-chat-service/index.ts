import { createServer } from 'http'
import { Server } from 'socket.io'
import { db } from '../../src/lib/db'

// ---------------------------------------------------------------------------
// HTTP + Socket.IO server
// ---------------------------------------------------------------------------

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path – Caddy forwards to this port based on path: '/'
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

function getOtherUserId(conversationId: string, myUserId: string): Promise<string | null> {
  return db.conversation
    .findUnique({ where: { id: conversationId } })
    .then((conv) => {
      if (!conv) return null
      return conv.user1Id === myUserId ? conv.user2Id : conv.user1Id
    })
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
// Socket connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)

  // -----------------------------------------------------------------------
  // auth – authenticate a socket with a userId
  // -----------------------------------------------------------------------
  socket.on('auth', async ({ userId }: { userId: string }) => {
    try {
      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user) {
        socket.emit('auth:error', { message: 'User not found' })
        return
      }

      onlineUsers.set(userId, socket.id)
      socketToUser.set(socket.id, userId)

      // Mark user online in DB
      await db.user.update({
        where: { id: userId },
        data: { online: true, lastSeen: new Date() },
      })

      socket.emit('auth:success', { userId })
      console.log(`[auth] ${userId} is now online (${onlineUsers.size} total)`)
    } catch (err) {
      console.error('[auth] error', err)
      socket.emit('auth:error', { message: 'Authentication failed' })
    }
  })

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
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      try {
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

        // Update conversation updatedAt
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })

        // Emit to recipient
        const otherUserId = await getOtherUserId(conversationId, userId)
        if (otherUserId) {
          emitToUser(otherUserId, 'message:new', message)
        }

        // Also echo back to sender so they have the server-generated id/timestamps
        socket.emit('message:new', message)

        console.log(`[message:send] ${userId} → conversation ${conversationId}`)
      } catch (err) {
        console.error('[message:send] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:edit – update message content
  // -----------------------------------------------------------------------
  socket.on(
    'message:edit',
    async ({ messageId, content }: { messageId: string; content: string }) => {
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      try {
        const updated = await db.message.update({
          where: { id: messageId, senderId: userId, deleted: false },
          data: { content, edited: true, updatedAt: new Date() },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
          },
        })

        // Emit to the other participant
        const otherUserId = await getOtherUserId(updated.conversationId, userId)
        if (otherUserId) {
          emitToUser(otherUserId, 'message:updated', updated)
        }
        socket.emit('message:updated', updated)

        console.log(`[message:edit] ${userId} edited message ${messageId}`)
      } catch (err) {
        console.error('[message:edit] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:delete – soft-delete a message
  // -----------------------------------------------------------------------
  socket.on(
    'message:delete',
    async ({ messageId }: { messageId: string }) => {
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      try {
        const message = await db.message.findUnique({ where: { id: messageId } })
        if (!message || message.senderId !== userId) return

        const deleted = await db.message.update({
          where: { id: messageId },
          data: { deleted: true, content: '', updatedAt: new Date() },
        })

        const otherUserId = await getOtherUserId(message.conversationId, userId)
        if (otherUserId) {
          emitToUser(otherUserId, 'message:deleted', { messageId, conversationId: message.conversationId })
        }
        socket.emit('message:deleted', { messageId, conversationId: message.conversationId })

        console.log(`[message:delete] ${userId} deleted message ${messageId}`)
      } catch (err) {
        console.error('[message:delete] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:read – mark unread messages as read
  // -----------------------------------------------------------------------
  socket.on(
    'message:read',
    async ({ conversationId }: { conversationId: string }) => {
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      try {
        // Mark all messages in the conversation not sent by this user as "delivered"/"read"
        await db.message.updateMany({
          where: {
            conversationId,
            senderId: { not: userId },
            status: { not: 'read' },
          },
          data: { status: 'read' },
        })

        const otherUserId = await getOtherUserId(conversationId, userId)
        if (otherUserId) {
          emitToUser(otherUserId, 'message:read', { conversationId, userId })
        }

        console.log(`[message:read] ${userId} read messages in ${conversationId}`)
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
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      const otherUserId = await getOtherUserId(conversationId, userId)
      if (otherUserId) {
        emitToUser(otherUserId, 'user:typing', { conversationId, userId, isTyping: true })
      }
    },
  )

  socket.on(
    'typing:stop',
    async ({ conversationId }: { conversationId: string }) => {
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      const otherUserId = await getOtherUserId(conversationId, userId)
      if (otherUserId) {
        emitToUser(otherUserId, 'user:typing', { conversationId, userId, isTyping: false })
      }
    },
  )

  // -----------------------------------------------------------------------
  // user:status – update status text & broadcast
  // -----------------------------------------------------------------------
  socket.on(
    'user:status',
    async ({ status }: { status: string }) => {
      const userId = socketToUser.get(socket.id)
      if (!userId) return

      try {
        await db.user.update({
          where: { id: userId },
          data: { status },
        })

        // Broadcast to all online users
        io.emit('user:status-change', { userId, status })
        console.log(`[user:status] ${userId} → "${status}"`)
      } catch (err) {
        console.error('[user:status] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------
  socket.on('disconnect', async () => {
    const userId = socketToUser.get(socket.id)
    if (!userId) {
      console.log(`[socket] disconnected (unauthenticated): ${socket.id}`)
      return
    }

    onlineUsers.delete(userId)
    socketToUser.delete(socket.id)

    // Mark user offline in DB
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

  // -----------------------------------------------------------------------
  // error handler
  // -----------------------------------------------------------------------
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
