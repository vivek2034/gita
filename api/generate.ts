
import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { prompt, systemInstruction } = await req.json();
  
  // Use process.env.API_KEY directly for initialization
  const apiKey = process.env.API_KEY as string;
  if (!apiKey) return new Response('API Key not configured', { status: 500 });

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { 
        systemInstruction: systemInstruction || "You are a helpful assistant.",
        temperature: 0.7
      },
    });

    // Extract text using .text property as per SDK guidelines
    return new Response(JSON.stringify({ text: response.text }));
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
