import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/jwt';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const payload = await verifyJWT(token);

    if (!payload) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({
      user: {
        id: payload.userId,
        email: payload.email,
        name: payload.name,
      },
    });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  // Clear cookie by setting it to empty and expired
  cookieStore.set('token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
  return NextResponse.json({ success: true });
}
