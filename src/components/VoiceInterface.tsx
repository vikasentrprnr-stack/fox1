import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Volume2, Sparkles, Activity, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ai } from '@/services/ai';
import { loadConfig, AppConfig } from '@/services/db';
import { motion, AnimatePresence } from 'motion/react';
import { LiveServerMessage, Modality } from '@google/genai';
import { createAudioWorkletNode, float32ToInt16, int16ToBase64, base64ToFloat32 } from '@/lib/audioUtils';

interface VoiceInterfaceProps {
  onClose: () => void;
}

export function VoiceInterface({ onClose }: VoiceInterfaceProps) {
  const [isLive, setIsLive] = useState(false);
  const [config, setConfig] = useState<AppConfig>({ sarcasmLevel: 80, voice: 'Kore' });
  const [aiText, setAiText] = useState('');
  const [userSpeech, setUserSpeech] = useState('');
  const [connecting, setConnecting] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scheduledTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
    return () => {
      stopLiveSession();
    };
  }, []);

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5;

      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        
        // Purple-pink gradient feel based on height
        const r = barHeight + 100;
        const g = 50;
        const b = 250 - barHeight;
        
        canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${barHeight / 150 + 0.1})`;
        
        const y = (height - barHeight) / 2; // centered
        canvasCtx.fillRect(x, y, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };
    draw();
  };

  const scheduleAudio = (ctx: AudioContext, audioData: Float32Array) => {
    const audioBuffer = ctx.createBuffer(1, audioData.length, 24000);
    audioBuffer.getChannelData(0).set(audioData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    // Maintain gapless playback
    const currentTime = ctx.currentTime;
    if (scheduledTimeRef.current < currentTime) {
        scheduledTimeRef.current = currentTime + 0.05; // tiny buffer for smooth start
    }
    source.start(scheduledTimeRef.current);
    scheduledTimeRef.current += audioBuffer.duration;
  };

  const startLiveSession = async () => {
    setConnecting(true);
    setAiText('Connecting to Fox...');
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const ctx = audioContextRef.current;
      await ctx.resume();

      streamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      const source = ctx.createMediaStreamSource(streamRef.current);
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; // lower size for chunkier bars
      analyserRef.current = analyser;
      source.connect(analyser);
      
      const workletNode = await createAudioWorkletNode(ctx);
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setIsLive(true);
            setConnecting(false);
            setAiText('How can I help you?');
            drawWaveform();
            
            workletNode.port.onmessage = (event) => {
              const float32Data = event.data as Float32Array;
              const int16Data = float32ToInt16(float32Data);
              const base64Data = int16ToBase64(int16Data);
              sessionPromise.then(session => 
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                })
              );
            };
            source.connect(workletNode);
            workletNode.connect(ctx.destination); // Required for some browsers to keep worklet alive
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            if (!serverContent) return;
            
            if (serverContent.interrupted) {
              scheduledTimeRef.current = ctx.currentTime;
              setAiText('...');
            }

            if (serverContent.modelTurn) {
               const parts = serverContent.modelTurn.parts;
               for (const part of parts) {
                 if (part.inlineData && part.inlineData.data) {
                    const audioFloatArray = base64ToFloat32(part.inlineData.data);
                    scheduleAudio(ctx, audioFloatArray);
                 }
                 if (part.text) {
                    setAiText(prev => prev === '...' || prev === 'How can I help you?' ? part.text : prev + part.text);
                 }
               }
            }
          },
          onclose: () => {
            stopLiveSession();
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            setAiText('An error occurred during communication.');
            stopLiveSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } },
          },
          systemInstruction: `You are Fox, a highly intellectual AI. You have a dutiful tone but with a distinct layer of sarcasm and fun. Your current sarcasm level is ${config.sarcasmLevel} out of 100. Always embody this personality. Reply concisely so the voice output is fast and snappy. Engage directly in the conversational mode.`,
        },
      });

      sessionRef.current = await sessionPromise;
      
    } catch (error) {
      console.error(error);
      setAiText('Failed to initialize microphone or connect to Fox.');
      setConnecting(false);
    }
  };

  const stopLiveSession = () => {
    setIsLive(false);
    setConnecting(false);
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    if (sessionRef.current) {
        try {
            const res = sessionRef.current.close();
            if (res && res.catch) res.catch(console.error);
        } catch (e) {
            console.error(e);
        }
        sessionRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (audioContextRef.current) {
        try {
            const res = audioContextRef.current.close();
            if (res && res.catch) res.catch(console.error);
        } catch (e) {
             console.error(e);
        }
        audioContextRef.current = null;
    }
    scheduledTimeRef.current = 0;
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#050505]/95 backdrop-blur-lg text-white overflow-hidden transform-gpu">
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-50"
      >
        <X size={24} />
      </button>

      <div className="absolute inset-0 max-w-lg mx-auto pointer-events-none flex items-center justify-center">
        <AnimatePresence>
          {isLive && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ repeat: Infinity, duration: 2, repeatType: 'reverse' }}
              className="absolute w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[100px]" 
            />
          )}
        </AnimatePresence>
      </div>

      <div className="z-10 flex flex-col items-center justify-center w-full max-w-md px-6 space-y-12">
        <div className="text-center space-y-2 h-32 flex flex-col items-center justify-end overflow-hidden">
          <AnimatePresence mode="wait">
             <motion.div
                 key="response"
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 className="flex flex-col items-center justify-center w-full"
               >
                 {connecting && <div className="text-sm text-purple-400 mb-2 uppercase tracking-widest font-bold animate-pulse">Symphonizing...</div>}
                 <p className="text-white text-xl md:text-2xl font-medium tracking-tight line-clamp-3 leading-relaxed text-center break-words z-10 relative">
                   {aiText}
                 </p>
             </motion.div>
          </AnimatePresence>
        </div>

        <div className="w-full h-16 flex items-center justify-center opacity-70">
           <canvas ref={canvasRef} width={300} height={60} className="w-full h-full object-contain" />
        </div>

        <motion.button
          onClick={isLive ? stopLiveSession : startLiveSession}
          disabled={connecting}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "relative flex items-center justify-center w-32 h-32 rounded-full shadow-2xl transition-all duration-300",
            isLive ? "bg-red-500/20 text-red-500 shadow-red-500/30" : 
            connecting ? "bg-gray-800/50 text-gray-400" : "bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow-purple-500/40"
          )}
        >
          {isLive ? (
            <Square fill="currentColor" size={40} className="animate-pulse" />
          ) : connecting ? (
            <Sparkles className="animate-spin" size={48} />
          ) : (
            <Mic size={48} />
          )}

          {isLive && (
             <span className="absolute inset-0 rounded-full border-[3px] border-red-500/40 animate-ping" />
          )}
        </motion.button>

        <div className="text-center text-gray-500 text-sm">
           {isLive ? "Tap to stop listening" : "Tap to start conversation"}
        </div>
      </div>
    </div>
  );
}
