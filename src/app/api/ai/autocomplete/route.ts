import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/jwt';
import { generateAutocomplete } from '@/lib/ai';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { contextBefore, contextAfter } = body;
    
    if (typeof contextBefore !== 'string') {
      return NextResponse.json({ error: 'Missing contextBefore string' }, { status: 400 });
    }

    const completion = await generateAutocomplete(contextBefore, contextAfter || '');
    return NextResponse.json({ completion });
  } catch (error) {
    console.error('Autocomplete API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
