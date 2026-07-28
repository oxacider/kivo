import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, stripPassword } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    if (conversation.user1Id !== currentUser.id && conversation.user2Id !== currentUser.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const before = searchParams.get('before')
    const where: Record<string, unknown> = {
      conversationId: id,
      deleted: false,
    }
    if (before) {
      where.createdAt = { lt: new Date(before) }
    }
    const messages = await db.message.findMany({
      where,
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, senderId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    // Mark sent messages as delivered
    const sentMsgIds = messages.filter((m) => m.senderId !== currentUser.id && m.status === 'sent').map((m) => m.id)
    if (sentMsgIds.length > 0) {
      await db.message.updateMany({ where: { id: { in: sentMsgIds } }, data: { status: 'delivered' } })
    }
    const data = messages.map((m) => ({
      ...m,
      sender: stripPassword(m.sender as Record<string, unknown>),
    }))
    return NextResponse.json({ success: true, data: { messages: data } })
  } catch (error) {
    console.error('Get messages error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id: convId } = await params
    const body = await request.json()
    const { messageId, content } = body
    if (!messageId || !content) return NextResponse.json({ success: false, error: 'messageId and content are required' }, { status: 400 })
    const message = await db.message.findUnique({ where: { id: messageId } })
    if (!message) return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    if (message.senderId !== currentUser.id) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    if (message.conversationId !== convId) return NextResponse.json({ success: false, error: 'Message not in this conversation' }, { status: 400 })
    const updated = await db.message.update({
      where: { id: messageId },
      data: { content, edited: true },
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, senderId: true } },
      },
    })
    return NextResponse.json({ success: true, data: { message: { ...updated, sender: stripPassword(updated.sender as Record<string, unknown>) } } })
  } catch (error) {
    console.error('Edit message error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
