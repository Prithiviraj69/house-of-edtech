import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

export async function getGeminiModel() {
  if (!genAI) return null;
  // Use gemini-2.5-flash as the standard AI Studio model
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

export async function generateAutocomplete(contextBefore: string, contextAfter: string): Promise<string> {
  const model = await getGeminiModel();
  if (!model) return '';

  const prompt = `You are a smart co-writer helper. Complete the following text based on the context before and after the cursor.
Context Before Cursor:
"""
${contextBefore}
"""
Context After Cursor (if any):
"""
${contextAfter}
"""

Provide ONLY the text completion that should immediately follow the Cursor. Do not wrap the response in markdown blocks or quotes. Do not include any explanations. Simply return the text completion itself.
Completion:`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 80,
        temperature: 0.3,
      }
    });
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini autocomplete error:', error);
    return '';
  }
}

export async function generateSummary(documentText: string): Promise<string> {
  const model = await getGeminiModel();
  if (!model) return 'AI key is not configured in the environment variables (GEMINI_API_KEY).';

  const prompt = `You are an expert editor. Summarize the following document in a clear, concise bulleted list, highlighting key topics.
Document:
"""
${documentText}
"""

Summary:`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.4,
      }
    });
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini summary error:', error);
    return 'Failed to generate summary.';
  }
}

export async function generateChatResponse(documentText: string, message: string): Promise<string> {
  const model = await getGeminiModel();
  if (!model) return 'AI key is not configured in the environment variables (GEMINI_API_KEY).';

  const prompt = `You are a helpful AI assistant integrated inside a collaborative document editor.
You have access to the document content below.
Document Content:
"""
${documentText}
"""

Answer the user's question about the document context or help them draft/edit.
User Question: ${message}

Response:`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.7,
      }
    });
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini chat error:', error);
    return 'Failed to get response from Gemini.';
  }
}
