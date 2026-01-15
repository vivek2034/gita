
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { prompt, language, history, useSearch } = await req.json();
    
    // Obtain API key strictly from environment variable
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API_KEY is not configured in Vercel environment variables.' }), { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const instruction = `${SYSTEM_INSTRUCTION}\n\nUSER SELECTED LANGUAGE: ${language}. Respond primarily in this language, keeping Shlokas in Sanskrit.`;

    const response = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: instruction,
        temperature: 0.8,
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
      },
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (e: any) {
          console.error("Stream generation error:", e);
          controller.error(e);
        }
      },
    });

    return new Response(stream);
  } catch (error: any) {
    console.error("API Chat Route Error:", error);
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred.', 
      details: error.stack 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
