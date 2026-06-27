import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { generateChatResponse } from '@/lib/ai';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { documentText, message } = body;

    if (typeof documentText !== 'string' || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing documentText or message' }, { status: 400 });
    }

    const reply = await generateChatResponse(documentText, message);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
