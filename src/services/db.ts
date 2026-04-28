import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  isVoiceRequest?: boolean;
  createdAt: number;
  imageUrls?: string[]; // Generated or uploaded images
  imagesData?: string[]; // base64
}

export interface AppConfig {
  sarcasmLevel: number; // 0 to 100
  voice: string; // Selected TTS Voice
}

const db = localforage.createInstance({
  name: "FoxAI_DB",
  storeName: "foxai_store"
});

export const loadChatHistory = async (): Promise<ChatMessage[]> => {
  const history = await db.getItem<ChatMessage[]>('chat_history');
  return history || [];
};

export const saveMessage = async (message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> => {
  const history = await loadChatHistory();
  const fullMessage = {
    ...message,
    id: uuidv4(),
    createdAt: Date.now()
  };
  history.push(fullMessage);
  await db.setItem('chat_history', history);
  return fullMessage;
};

export const clearChatHistory = async () => {
  await db.removeItem('chat_history');
};

export const loadConfig = async (): Promise<AppConfig> => {
  const config = await db.getItem<AppConfig>('app_config');
  return config || { sarcasmLevel: 80, voice: 'Aoede' };
};

export const saveConfig = async (config: AppConfig) => {
  await db.setItem('app_config', config);
};
