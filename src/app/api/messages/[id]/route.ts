import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const message = await db.message.findUnique({ where: { id } })
    if (!message) return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const isOwn = message.senderId === currentUser.id
    const isRecent = message.createdAt > oneHourAgo
    if (!isOwn && !isRecent) return NextResponse.json({ success: false, error: 'Cannot delete this message' }, { status: 403 })
    const updated = await db.message.update({
      where: { id },
      data: { deleted: true, content: 'This message was deleted' },
    })
    return NextResponse.json({ success: true, data: { message: updated } })
  } catch (error) {
    console.error('Delete message error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
