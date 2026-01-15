
import { GoogleGenAI, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export class GitaService {
  /**
   * We get the AI instance using static checks for Vite.
   */
  private getAI() {
    // @ts-ignore
    const apiKey = import.meta.env?.VITE_API_KEY || (window as any).process?.env?.API_KEY || "";
    
    if (!apiKey) {
      throw new Error("Divine connection failed: API Key is missing. Ensure VITE_API_KEY is set in Vercel.");
    }
    return new GoogleGenAI({ apiKey });
  }

  async *getGuidanceStream(
    userPrompt: string, 
    language: string,
    history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
  ) {
    const ai = this.getAI();
    const instruction = `${SYSTEM_INSTRUCTION}\n\nUSER SELECTED LANGUAGE: ${language}. Respond primarily in this language, keeping Shlokas in Sanskrit.`;

    const result = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: instruction,
        temperature: 0.8,
      },
    });

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  async generateSpeech(text: string): Promise<string | undefined> {
    try {
      const ai = this.getAI();
      const speechPrompt = `You are Lord Krishna. Speak the following in a calm, majestic, and spiritual voice with a divine Indian accent: ${text}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: speechPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return base64Data;
    } catch (e) {
      console.error("Speech generation failed", e);
      throw e;
    }
  }
}

export const gitaService = new GitaService();
