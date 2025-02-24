// app/api/system-prompt/route.ts

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'systemPrompt.txt');
    const prompt = await fs.readFile(filePath, 'utf8');
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error reading system prompt:', error);
    return NextResponse.json({ error: 'Failed to read system prompt' }, { status: 500 });
  }
}
