import { Prisma } from '@prisma/client';
import { getAuthUser, errorResponse } from '@/lib/auth';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { getProfile, updateProfile, ProfileValidationError, ProfileConflictError } from '@/lib/profiles-service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getProfile(id);
    if (!user) return errorResponse('User not found', 404);
    return Response.json({ success: true, data: user });
  } catch {
    return errorResponse('Failed to fetch user', 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: any = null;
  try {
    const { id } = await params;
    console.log('[PUT /api/users/[id]] params.id:', id);

    // Log Firebase identity WITHOUT changing the auth flow (getAuthUser still gates)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const fb = await verifyFirebaseIdToken(token);
      console.log('[PUT /api/users/[id]] Firebase uid:', fb?.uid ?? '(unavailable)', '| Firebase email:', fb?.email ?? '(unavailable)');
    } else {
      console.log('[PUT /api/users/[id]] No Bearer token in Authorization header');
    }

    const authUser = await getAuthUser(request);
    console.log('[PUT /api/users/[id]] authenticated DB user:', authUser ? { id: authUser.id, email: authUser.email } : 'null');
    if (!authUser) return errorResponse('Unauthorized', 401);
    if (authUser.id !== id) return errorResponse('Forbidden', 403);

    body = await request.json();
    console.log('[PUT /api/users/[id]] request payload:', JSON.stringify(body));

    // Log the Prisma query that updateProfile() will execute
    console.log(`[PUT /api/users/[id]] Prisma query: db.user.update({ where: { id: "${id}" }, data: ${JSON.stringify(body)} })`);
    const user = await updateProfile(id, body);
    console.log('[PUT /api/users/[id]] updateProfile() succeeded');
    return Response.json({ success: true, data: user });
  } catch (err) {
    console.error('[PUT /api/users/[id]] EXCEPTION:', err);
    if (err instanceof Error) console.error('[PUT /api/users/[id]] STACK TRACE:\n', err.stack);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[PUT /api/users/[id]] PRISMA ERROR CODE:', err.code);
    }

    if (err instanceof ProfileConflictError) {
      console.error('[PUT /api/users/[id]] CONFLICT — field: username —', err.message);
      return errorResponse(err.message, 409);
    }
    if (err instanceof ProfileValidationError) {
      // updateProfile() only ever validates the username field
      console.error('[PUT /api/users/[id]] VALIDATION FAILED — field: username — payload keys:', body ? Object.keys(body) : '(no payload)', '—', err.message);
      return errorResponse(err.message);
    }

    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(message, 500);
  }
}
