import { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Image as ImageIcon, Sparkles, Volume2, VolumeX, History, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChatWithFox, generateSpeech } from '@/services/ai';
import { loadChatHistory, saveMessage, clearChatHistory, ChatMessage, AppConfig, loadConfig } from '@/services/db';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'motion/react';

import { VoiceInterface } from './VoiceInterface';

const THINKING_PHRASES = [
  "defining user's input",
  "defining scope",
  "evaluating scenario",
  "thinking deeply",
  "scrutinizing",
  "assessing required assets",
  "cooking",
  "getting desired output"
];

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig>({ sarcasmLevel: 80, voice: 'Kore' });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioAutoPlayEnabled, setIsAudioAutoPlayEnabled] = useState(true);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlayAudio = async (msgId: string, text: string) => {
     if (playingMessageId === msgId) {
       setPlayingMessageId(null);
       if (audioUrl) URL.revokeObjectURL(audioUrl);
       setAudioUrl(null);
       audioRef.current?.pause();
       return;
     }

     if (playingMessageId && audioUrl) {
       // Stop the previous one before starting a new one
       URL.revokeObjectURL(audioUrl);
       audioRef.current?.pause();
     }

     setLoadingAudioId(msgId);
     try {
       const url = await generateSpeech(text, config.voice);
       if (url) {
          setAudioUrl(url);
          setPlayingMessageId(msgId);
          setTimeout(() => {
             audioRef.current?.play();
          }, 100);
       }
     } catch (e) {
       console.error("Failed to play", e);
     } finally {
       setLoadingAudioId(null);
     }
  };

  const stopAudio = () => {
      setPlayingMessageId(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      audioRef.current?.pause();
  };

  useEffect(() => {
    loadChatHistory().then(setMessages);
    loadConfig().then(setConfig);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput(finalTranscript);
          handleSend(finalTranscript, true); // Auto send voice input as a voice request
        }
      };

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = (e: any) => {
        console.error("Speech recognition error", e);
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, thinkingIndex]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setThinkingIndex(0);
      interval = setInterval(() => {
        setThinkingIndex(prev => (prev + 1) % THINKING_PHRASES.length);
      }, 1500); // cycle phrases every 1.5s
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSend = async (text: string = input, isVoiceRequest: boolean = false) => {
    if (!text.trim() || isLoading) return;
    
    setInput('');
    setIsLoading(true);
    setAudioUrl(null); // Clear previous audio
    setThinkingIndex(0);

    const userMessage = await saveMessage({ role: 'user', content: text, isVoiceRequest });
    setMessages(prev => [...prev, userMessage]);

    let assistantResponse = "";
    const assistantMessageId = "temp-" + Date.now();
    
    setMessages(prev => [...prev, { id: assistantMessageId, role: 'model', content: '', createdAt: Date.now() }]);

    try {
      const stream = streamChatWithFox(
        text, 
        messages, 
        config.sarcasmLevel,
        async (prompt, imageB64s) => {
          // Callback when image is generated
          const msg = await saveMessage({ role: 'model', content: `*[Generated Image for: ${prompt}]*`, imageUrls: imageB64s });
          setMessages(prev => [...prev.filter(m => m.id !== assistantMessageId), msg]);
        },
        (newLevel) => {
          setConfig(prev => ({...prev, sarcasmLevel: newLevel}));
          // (In a real app, also persist this to config DB immediately)
        }
      );

      for await (const chunk of stream) {
        setIsLoading(false); // Stop thinking animation once stream starts
        assistantResponse += chunk;
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: assistantResponse } : m));
      }

      const finalMsg = await saveMessage({ role: 'model', content: assistantResponse });
      // Remove temp
      setMessages(prev => [...prev.filter(m => m.id !== assistantMessageId), finalMsg]);

      // Generate voice only if user requested via voice, and autoplay is on
      if (isVoiceRequest && isAudioAutoPlayEnabled && assistantResponse) {
         handlePlayAudio(assistantMessageId, assistantResponse);
      }
    } catch (error) {
      console.error(error);
      setIsLoading(false);
      setMessages(prev => [...prev.filter(m => m.id !== assistantMessageId), { id: 'err', role: 'system', content: 'An error occurred while communicating with Fox. Provide active internet.', createdAt: Date.now() }]);
    } finally {
      setIsLoading(false);
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setInput(''); // clear input before recording
      recognitionRef.current?.start();
    }
  };

  const handleDeleteHistory = async () => {
      if(confirm('Delete all history?')) {
          await clearChatHistory();
          setMessages([]);
      }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-100 relative max-h-screen">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-6 py-4 flex items-center justify-between border-b border-[#1f1f1f] bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-10 md:pl-6 pl-16"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="text-purple-400" size={18} />
            Chat with Fox
          </h2>
          <p className="text-xs text-gray-400">Intelligent, fast, and sarcastically yours.</p>
        </div>
        <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsVoiceOverlayOpen(true)}
              className="px-3 py-1.5 rounded-full flex items-center space-x-2 bg-gradient-to-tr from-purple-500/20 to-pink-500/20 text-purple-400 hover:text-purple-300 font-medium text-sm transition-colors"
              title="Live Voice Conversation"
            >
              <Mic size={16} /> <span className="hidden sm:inline">Live Voice</span>
            </button>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={cn("p-2 rounded-full transition-colors", showHistory ? "bg-[#2a2a2a] text-white" : "bg-gray-800 text-gray-400")}
              title="Toggle History"
            >
              <History size={18} />
            </button>
            <button 
              onClick={() => setIsAudioAutoPlayEnabled(!isAudioAutoPlayEnabled)}
              className={cn("p-2 rounded-full transition-colors", isAudioAutoPlayEnabled ? "bg-purple-500/20 text-purple-400" : "bg-gray-800 text-gray-400")}
              title="Toggle Voice Output for Voice Inputs"
            >
              {isAudioAutoPlayEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {isVoiceOverlayOpen && (
          <VoiceInterface onClose={() => setIsVoiceOverlayOpen(false)} />
        )}
      </AnimatePresence>

      {/* Audio Element Hidden */}
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          autoPlay 
          className="hidden" 
          onEnded={() => { URL.revokeObjectURL(audioUrl); setPlayingMessageId(null); }} 
          onError={(e) => console.error("Audio playback error:", e)}
        />
      )}

      {/* Main Layout containing Chat and optional History Sidebar */}
      <div className="flex-1 flex overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center h-full text-center space-y-4 text-gray-500"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center shadow-lg">
                  <Sparkles size={32} className="text-purple-400/50" />
                </div>
                <p className="max-w-xs">Ask me a question, tell me to generate an image, or adjust my sarcasm level.</p>
              </motion.div>
            )}
            <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div 
                key={msg.id || i} 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                layout
                className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}
              >
                <div className={cn(
                  "px-5 py-3.5 rounded-2xl max-w-[85%] md:max-w-[70%] text-[15px] leading-relaxed shadow-sm",
                  msg.role === 'user' 
                    ? "bg-gradient-to-br from-purple-600 to-purple-800 text-white rounded-br-none" 
                    : msg.role === 'system'
                      ? "bg-red-900/20 text-red-400 border border-red-900/50 rounded-bl-none"
                      : "bg-[#1f1f1f] text-gray-200 border border-[#2a2a2a] rounded-bl-none"
                )}>
                  {msg.content === '' && msg.role === 'model' && !isLoading ? (
                      <span className="opacity-50">...</span>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown
                        components={{
                          code({node, inline, className, children, ...props}: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                children={String(children).replace(/\n$/, '')}
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-lg my-2 text-sm"
                                {...props}
                              />
                            ) : (
                              <code className="bg-black/30 px-1.5 py-0.5 rounded text-sm text-pink-300" {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.imageUrls && msg.imageUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                      {msg.imageUrls.map((url, idx) => (
                        <img key={idx} src={url} alt="Generated" className="rounded-xl border border-white/10 shadow-md w-full object-cover aspect-square" />
                      ))}
                    </div>
                  )}
                  {msg.role === 'model' && msg.content && !isLoading && (
                     <div className="mt-2 flex items-center justify-end">
                       <button
                         onClick={() => msg.id && handlePlayAudio(msg.id, msg.content)}
                         disabled={loadingAudioId !== null && loadingAudioId !== msg.id}
                         className={cn(
                           "p-1.5 rounded-lg transition-colors flex items-center space-x-1.5 text-xs font-medium",
                           playingMessageId === msg.id ? "bg-purple-500/20 text-purple-300" : "hover:bg-white/10 text-gray-400"
                         )}
                         title={playingMessageId === msg.id ? "Stop Reading" : "Read Out text"}
                       >
                         {loadingAudioId === msg.id ? <Sparkles size={14} className="animate-spin" /> : 
                          playingMessageId === msg.id ? <Square fill="currentColor" size={14} /> : <Volume2 size={14} />}
                         <span>
                             {loadingAudioId === msg.id ? 'Generating...' : playingMessageId === msg.id ? 'Stop' : 'Read out'}
                         </span>
                       </button>
                     </div>
                  )}
                </div>
                {msg.role === 'user' && msg.isVoiceRequest && (
                  <span className="text-[10px] text-gray-500 mt-1 flex items-center pr-1 tracking-wider uppercase">
                    <Mic size={10} className="mr-1" /> Voice Input
                  </span>
                )}
              </motion.div>
            ))}
            </AnimatePresence>
            
            <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-start"
              >
                 <div className="bg-[#1f1f1f] text-gray-200 border border-[#2a2a2a] rounded-2xl rounded-bl-none px-5 py-3 max-w-[85%] flex items-center gap-3">
                    <span className="flex space-x-1 outline-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                    <AnimatePresence mode="wait">
                      <motion.span 
                        key={thinkingIndex}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-purple-400 font-medium italic"
                      >
                        {THINKING_PHRASES[thinkingIndex]}...
                      </motion.span>
                    </AnimatePresence>
                 </div>
              </motion.div>
            )}
            </AnimatePresence>
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* History Sidebar */}
          <AnimatePresence>
              {showHistory && (
                  <motion.div 
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 250, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="border-l border-[#1f1f1f] bg-[#141414] overflow-y-auto flex-shrink-0"
                  >
                      <div className="p-4 flex items-center justify-between border-b border-[#1f1f1f]">
                          <h3 className="font-medium text-sm text-gray-300">Memories & History</h3>
                          <button onClick={handleDeleteHistory} className="text-red-400 hover:text-red-300 p-1">
                              <Trash2 size={14} />
                          </button>
                      </div>
                      <div className="p-2 space-y-1">
                          {messages.filter(m => m.role === 'user').slice().reverse().map((msg, i) => (
                              <div key={i} className="p-2 text-xs text-gray-400 hover:bg-[#1f1f1f] rounded-lg cursor-pointer truncate">
                                  {msg.content}
                              </div>
                          ))}
                      </div>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>

      {/* Input Box */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="p-4 md:p-6 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent shrink-0 z-10"
      >
        <div className="max-w-4xl mx-auto relative flex items-end bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden rounded-2xl shadow-xl transition-all focus-within:border-purple-500/50 focus-within:ring-1 focus-within:ring-purple-500/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Talk to Fox..."
            className="flex-1 max-h-32 min-h-[56px] w-full resize-none py-4 px-5 bg-transparent text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-0 leading-relaxed disabled:opacity-50"
            disabled={isLoading || isRecording}
            rows={1}
            style={{ height: 'auto', maxHeight: '120px' }}
          />
          <div className="flex items-center gap-2 px-3 pb-3">
             <button
              onClick={toggleRecording}
              disabled={isLoading || !recognitionRef.current}
              className={cn(
                "p-2.5 rounded-xl transition-all outline-none",
                isRecording 
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 ring-1 ring-red-500/50 animate-pulse" 
                  : "text-gray-400 hover:bg-[#2a2a2a] hover:text-white"
              )}
            >
              {isRecording ? <Square size={18} fill="currentColor" className="scale-75" /> : <Mic size={18} />}
            </button>
            <button
              onClick={() => handleSend(input, false)}
              disabled={!input.trim() || isLoading}
              className={cn(
                "p-2.5 rounded-xl transition-all text-white outline-none flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed",
                input.trim() ? "bg-gradient-to-tr from-purple-600 to-pink-600 shadow-lg shadow-purple-500/20" : "bg-[#2a2a2a] text-gray-500"
              )}
            >
              <Send size={18} className={cn("transition-transform", input.trim() && "translate-x-0.5")} />
            </button>
          </div>
        </div>
        <div className="mt-3 text-center">
            <p className="text-[11px] text-gray-500 tracking-wide">Fox uses real-time processing and internet search to respond efficiently.</p>
        </div>
      </motion.div>
    </div>
  );
}
