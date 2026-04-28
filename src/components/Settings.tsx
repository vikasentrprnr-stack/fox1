import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Trash2, Sliders, Volume2, Info, Play, Square, Sparkles } from 'lucide-react';
import { loadConfig, saveConfig, clearChatHistory, AppConfig } from '@/services/db';
import { generateSpeech } from '@/services/ai';

export function Settings() {
  const [config, setConfig] = useState<AppConfig>({ sarcasmLevel: 80, voice: 'Aoede' });
  const [isSaved, setIsSaved] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
    audioRef.current = new Audio();
    audioRef.current.onended = () => setPlayingVoice(null);
  }, []);

  const handleChange = (key: keyof AppConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleClearMemory = async () => {
    if (confirm("Are you sure you want to completely erase Fox AI's memory? This conversation history cannot be recovered.")) {
      await clearChatHistory();
      alert("Memory completely erased.");
    }
  };

  const handlePreviewVoice = async (voice: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingVoice === voice) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }

    setLoadingVoice(voice);
    try {
      const url = await generateSpeech(`Hello, I am ${voice}. This is my voice.`, voice);
      if (url && audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlayingVoice(voice);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVoice(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-100 overflow-y-auto">
      <div className="px-6 py-8 md:py-12 max-w-4xl mx-auto w-full md:pl-6 pl-16">
        <div className="flex items-center space-x-3 mb-8">
          <SettingsIcon size={32} className="text-purple-400" />
          <h2 className="text-3xl font-semibold tracking-tight">System Settings</h2>
        </div>
        
        <div className="space-y-8">
          
          {/* Personality Settings */}
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-3xl p-6 md:p-8 space-y-6">
            <h3 className="text-xl font-medium flex items-center mb-6">
              <Sliders className="mr-3 text-pink-400" size={20} />
              Personality Engine
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-300">Sarcasm & Wit Level</label>
                <span className="text-sm font-bold text-purple-400">{config.sarcasmLevel}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={config.sarcasmLevel}
                onChange={(e) => handleChange('sarcasmLevel', parseInt(e.target.value))}
                className="w-full h-2 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <p className="text-xs text-gray-500">
                0% is completely robotic and dutiful. 100% is highly sarcastic. Note: You can also ask Fox directly in chat to change this level!
              </p>
            </div>
          </div>

          {/* Voice Settings */}
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-3xl p-6 md:p-8 space-y-6">
            <h3 className="text-xl font-medium flex items-center mb-6">
              <Volume2 className="mr-3 text-purple-400" size={20} />
              Voice Synthesis
            </h3>
            
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-300">Select Voice Synthesizer</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {['Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir'].map(voice => (
                  <button
                    key={voice}
                    onClick={() => handleChange('voice', voice)}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between text-sm font-medium ${
                      config.voice === voice 
                        ? 'bg-purple-900/30 border-purple-500 text-white' 
                        : 'bg-[#1f1f1f] border-[#2a2a2a] text-gray-400 hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <span>{voice}</span>
                    <div 
                      onClick={(e) => handlePreviewVoice(voice, e)}
                      className={`p-1.5 rounded-full ${playingVoice === voice ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-white/10 text-gray-400'}`}
                    >
                      {loadingVoice === voice ? <Sparkles size={14} className="animate-spin" /> : playingVoice === voice ? <Square fill="currentColor" size={14} /> : <Play size={14} />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 flex items-center mt-2">
                <Info size={12} className="mr-1" /> Aoede is a highly expressive, sweet, and elegant voice. Kore provides a balanced, clear tone.
              </p>
            </div>
          </div>

          {/* Data & Privacy */}
          <div className="bg-red-950/10 border border-red-900/30 rounded-3xl p-6 md:p-8 space-y-6">
            <h3 className="text-xl font-medium flex items-center mb-2 text-red-400">
              <Trash2 className="mr-3" size={20} />
              Memory & Privacy
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              All conversation history is securely stored <strong>locally on your device</strong>. Erasing it resets Fox AI's active memory context.
            </p>
            
            <button 
              onClick={handleClearMemory}
              className="px-6 py-3 bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50 rounded-xl transition-colors font-medium text-sm flex items-center"
            >
              Clear Local Memory
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
