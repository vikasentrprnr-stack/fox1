import { GoogleGenAI, Type, FunctionDeclaration, Modality, LiveServerMessage } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const generateImageDeclaration: FunctionDeclaration = {
  name: "generateImage",
  description: "Generate an image based on a prompt when the user asks.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: "The prompt describing what image to generate.",
      },
    },
    required: ["prompt"],
  },
};

const changeSarcasmDeclaration: FunctionDeclaration = {
  name: "changeSarcasm",
  description: "Update the sarcasm level of Fox. Call this when the user asks to increase or decrease sarcasm.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      newLevel: {
        type: Type.NUMBER,
        description: "The new sarcasm level from 0 to 100.",
      },
      reasoning: {
        type: Type.STRING,
        description: "A short sarcastic response acknowledging the change.",
      }
    },
    required: ["newLevel", "reasoning"],
  },
};

export const getSystemPrompt = (sarcasmLevel: number) => {
  const currentDate = new Date().toLocaleString();
  return `You are Fox, a highly intellectual AI. You have a dutiful tone but with a distinct layer of sarcasm and fun. 
Your current sarcasm level is ${sarcasmLevel} out of 100. Always embody this personality. 
You are here to assist the user efficiently and intelligently.
Current date and time: ${currentDate}. You have access to the internet to answer real-time questions, use it whenever necessary.
If the user asks to change your sarcasm level, use the changeSarcasm function.
If the user asks for an image, use the generateImage function.
For general responses, provide concise intelligent answers.
Do NOT mention your internal routing techniques or model names unless explicitly asked.`;
};

export const getModelRouter = (query: string) => {
  // Simple heuristic: if query is short and seems like small talk/greeting -> fast, else pro
  const fastPatterns = /^(hi|hello|hey|sup|morning|evening|thanks|thank you|ok|bye)\b/i;
  
  if (query.split(' ').length < 10 && fastPatterns.test(query.trim())) {
    return "gemini-3.1-flash-lite-preview"; // very fast for simple
  } else if (query.length > 200) {
    return "gemini-3.1-pro-preview"; // complex
  }
  return "gemini-3.1-pro-preview"; // Default to pro for better Google Search integration and reasoning
};

export const streamChatWithFox = async function* (
  message: string, 
  history: any[], 
  sarcasmLevel: number,
  onImageGenerated?: (prompt: string, images: string[]) => void,
  onSarcasmChanged?: (level: number) => void
) {
  const modelName = getModelRouter(message);
  
  // Format history for Gemini
  let apiContents: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));
  
  // Add current msg
  apiContents.push({ role: 'user', parts: [{ text: message }] });

  const responseStream = await ai.models.generateContentStream({
    model: modelName,
    contents: apiContents,
    config: {
      systemInstruction: getSystemPrompt(sarcasmLevel),
      tools: [
        { functionDeclarations: [generateImageDeclaration, changeSarcasmDeclaration] },
        { googleSearch: {} }
      ],
      temperature: 0.7,
      toolConfig: {
        // @ts-ignore
        includeServerSideToolInvocations: true
      }
    } as any
  });

  let fullResponse = "";

  for await (const chunk of responseStream) {
    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
      for (const call of chunk.functionCalls) {
        if (call.name === "changeSarcasm") {
          const args = call.args as any;
          if (args.newLevel !== undefined && onSarcasmChanged) {
            onSarcasmChanged(args.newLevel);
          }
          if (args.reasoning) {
            yield args.reasoning;
          }
        } else if (call.name === "generateImage") {
          const args = call.args as any;
          if (args.prompt && onImageGenerated) {
            try {
              const imgRes = await ai.models.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: { parts: [{ text: args.prompt }] },
                config: {
                  imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
                }
              });
              const b64s: string[] = [];
              for (const part of (imgRes.candidates || [])[0]?.content?.parts || []) {
                if (part.inlineData) {
                   b64s.push(`data:image/png;base64,${part.inlineData.data}`);
                }
              }
              onImageGenerated(args.prompt, b64s);
              yield "I have generated the image for you.";
            } catch (err: any) {
              console.error("Image generation failed", err);
              // Fallback to free pollinations.ai model if Pro API is rate limited
              const encodedPrompt = encodeURIComponent(args.prompt);
              const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
              onImageGenerated(args.prompt, [fallbackUrl]);
              yield "I have generated the image for you using an alternative model.";
            }
          }
        }
      }
    }

    let chunkText = "";
    if (chunk.candidates?.[0]?.content?.parts) {
       for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
             chunkText += part.text;
          }
       }
    }
    
    if (chunkText) {
      fullResponse += chunkText;
      yield chunkText;
    }
  }
};

export const generateSpeech = async (text: string, voiceName: string): Promise<string | null> => {
   try {
     const cleanText = text.replace(/[*#]/g, '').trim();
     if (!cleanText) return null;
     
     const response = await ai.models.generateContent({
       model: "gemini-3.1-flash-tts-preview",
       contents: [{ parts: [{ text: cleanText }] }],
       config: {
         responseModalities: ["AUDIO"],
         speechConfig: {
             voiceConfig: {
               prebuiltVoiceConfig: { voiceName: voiceName },
             },
         },
       },
     });

     const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
     if (base64Audio) {
       return getWavUrlFromPcmBase64(base64Audio, 24000);
     }
     return null;
   } catch (e) {
     console.error("Speech Generation Error", e);
     return null;
   }
};

function getWavUrlFromPcmBase64(base64: string, sampleRate = 24000) {
  const binaryString = atob(base64);
  const pcmData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmData[i] = binaryString.charCodeAt(i);
  }
  
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  const writeString = (v: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);
  
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export const categorizeAndClusterImages = async (imageB64s: string[]) => {
  // Use Gemini to analyze and cluster images
  if (imageB64s.length === 0) return [];
  
  const parts = imageB64s.map((b64, index) => {
    return {
      inlineData: {
        data: b64.split(",")[1] || b64,
        mimeType: "image/jpeg"
      }
    };
  });
  
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        { role: 'user', parts: [
          ...parts, 
          { text: "Analyze the provided images. Categorize them using unsupervised learning concepts based on their visual similarity and subject matter. Return a JSON array where each element has 'categoryName', 'reasoning', and 'imageIndices' (array of integers matching the order of provided images, 0-indexed)." }
        ]}
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
        return JSON.parse(text);
    }
    return [];
  } catch (error) {
    console.error("Clustering error:", error);
    return [];
  }
}

