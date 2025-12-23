
import { GoogleGenAI } from "@google/genai";
// Fix: Change NetworkElement to NetworkNode to match the exported type in types.ts
import { NetworkNode } from "../types";

export const analyzeLinkBudget = async (elements: NetworkNode[], totalLoss: number) => {
  // Always initialize with the named parameter apiKey
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const elementDescriptions = elements.map(e => {
    let desc = `${e.type}: ${e.loss} dB`;
    if (e.length) desc += ` (${e.length} km)`;
    return desc;
  }).join(', ');

  const prompt = `
    Como um engenheiro de redes ópticas (PON), analise este projeto de rota:
    Elementos: ${elementDescriptions}
    Perda Total Calculada: ${totalLoss.toFixed(2)} dB.
    
    Por favor, forneça uma análise técnica curta (máximo 150 palavras) em Português sobre:
    1. Se a perda está dentro dos padrões aceitáveis (G.984 GPON geralmente aguenta ~28dB).
    2. Sugestões de melhoria se a perda for muito alta.
    3. Riscos potenciais nessa configuração.
    
    Seja direto e profissional.
  `;

  try {
    // Using gemini-3-pro-preview for complex engineering and math reasoning tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    // Access the .text property directly on the GenerateContentResponse object
    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Não foi possível realizar a análise automática no momento.";
  }
};
