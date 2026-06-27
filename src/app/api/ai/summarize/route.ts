import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { generateSummary } from '@/lib/ai';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { documentText } = body;

    if (typeof documentText !== 'string') {
      return NextResponse.json({ error: 'Missing documentText' }, { status: 400 });
    }

    const summary = await generateSummary(documentText);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summarize API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
