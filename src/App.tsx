import React, { useState, useEffect, useRef } from 'react';
import { Copy, Send, LogOut, Plus, LogIn, Check, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db } from './firebase';
import { ref, onValue, push, set, serverTimestamp, off, query, orderByChild, startAt, onDisconnect, remove } from 'firebase/database';

type Message = {
  id: string;
  text: string;
  sender: 'me' | 'other';
  timestamp: number;
};

// ID de session unique généré une seule fois par onglet
const SESSION_ID = (() => {
  const arr = new Uint32Array(2);
  window.crypto.getRandomValues(arr);
  return arr[0].toString(36) + arr[1].toString(36);
})();

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const myMessageKeys = useRef<Set<string>>(new Set());
  const presenceRef = useRef<any>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Gestion de la présence : quand tout le monde part, la salle se vide
  useEffect(() => {
    if (!inRoom || !roomCode) return;

    // Enregistre la présence de cet onglet dans Firebase
    const myPresenceRef = ref(db, `presence/${roomCode}/${SESSION_ID}`);
    presenceRef.current = myPresenceRef;
    set(myPresenceRef, true);

    // Quand cet onglet se déconnecte, Firebase supprime automatiquement sa présence
    const disconnectPresence = onDisconnect(myPresenceRef);
    disconnectPresence.remove();

    // Surveille le nombre de présences : si 0, on supprime les messages
    const presenceRoomRef = ref(db, `presence/${roomCode}`);
    const unsubPresence = onValue(presenceRoomRef, (snapshot) => {
      if (!snapshot.exists()) {
        // Plus personne dans la salle → on nettoie les messages
        remove(ref(db, `rooms/${roomCode}`));
      }
    });

    return () => {
      // Nettoyage quand on quitte manuellement
      remove(myPresenceRef);
      off(presenceRoomRef);
    };
  }, [inRoom, roomCode]);

  // Écoute des messages Firebase
  useEffect(() => {
    if (!inRoom || !roomCode) return;

    const oneHourAgo = Date.now() - 3600000;
    const messagesRef = query(
      ref(db, `rooms/${roomCode}`),
      orderByChild('timestamp'),
      startAt(oneHourAgo)
    );

    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedMessages: Message[] = [];
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          if (Date.now() - val.timestamp < 3600000) {
            loadedMessages.push({
              id: key,
              text: val.content,
              sender: myMessageKeys.current.has(key) ? 'me' : 'other',
              timestamp: val.timestamp
            });
          }
        });
        loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    });

    return () => {
      off(ref(db, `rooms/${roomCode}`));
    };
  }, [inRoom, roomCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateCode = () => {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return (Math.floor(array[0] % 900000) + 100000).toString();
  };

  const handleCreateRoom = () => {
    const code = generateCode();
    setRoomCode(code);
    setInRoom(true);
    setMessages([]);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim().length > 0) {
      setRoomCode(inputCode.trim());
      setInRoom(true);
      setMessages([]);
    }
  };

  const handleLeaveRoom = () => {
    // Supprime la présence manuellement avant de quitter
    if (presenceRef.current) {
      remove(presenceRef.current);
      presenceRef.current = null;
    }
    setInRoom(false);
    setRoomCode('');
    setInputCode('');
    setMessages([]);
    myMessageKeys.current.clear();
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim().length > 0) {
      const messagesRef = ref(db, `rooms/${roomCode}`);
      const newMsgRef = push(messagesRef);
      if (newMsgRef.key) {
        myMessageKeys.current.add(newMsgRef.key);
      }
      set(newMsgRef, {
        content: inputText.trim(),
        timestamp: serverTimestamp()
      }).catch(err => {
        console.error("Erreur d'envoi:", err);
      });
      setInputText('');
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50 font-sans selection:bg-indigo-500/30 transition-colors duration-300">
      <div className="max-w-3xl mx-auto p-4 md:p-8 h-screen flex flex-col">
        <header className="flex items-center justify-between py-6 border-b border-neutral-200 dark:border-neutral-800/50 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Send className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">ClipShare</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-900 rounded-lg transition-colors"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            {inRoom && (
              <button
                onClick={handleLeaveRoom}
                className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors px-3 py-1.5 rounded-lg dark:hover:bg-neutral-900"
              >
                <LogOut className="w-4 h-4" />
                Leave Room
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col relative">
          <AnimatePresence mode="wait">
            {!inRoom ? (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full gap-8"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight">Share instantly</h2>
                  <p className="text-neutral-500 dark:text-neutral-400">Transfer text and links between your devices in real-time.</p>
                </div>

                <div className="w-full space-y-4">
                  <button
                    onClick={handleCreateRoom}
                    className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white dark:bg-white dark:text-black py-4 rounded-2xl font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all active:scale-[0.98]"
                  >
                    <Plus className="w-5 h-5" />
                    Create New Room
                  </button>

                  <div className="relative flex items-center py-4">
                    <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800"></div>
                    <span className="flex-shrink-0 mx-4 text-neutral-400 dark:text-neutral-500 text-sm">or join existing</span>
                    <div className="flex-grow border-t border-neutral-200 dark:border-neutral-800"></div>
                  </div>

                  <form onSubmit={handleJoinRoom} className="space-y-3">
                    <input
                      type="text"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl py-4 px-5 text-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:tracking-normal text-neutral-900 dark:text-white"
                      maxLength={6}
                    />
                    <button
                      type="submit"
                      disabled={inputCode.length === 0}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-medium hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogIn className="w-5 h-5" />
                      Join Room
                    </button>
                  </form>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="room"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col h-full"
              >
                <div className="bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mb-1">Your Room Code</p>
                    <span className="text-4xl font-mono tracking-widest font-bold text-neutral-900 dark:text-white">
                      {roomCode}
                    </span>
                  </div>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-white px-4 py-2.5 rounded-xl transition-colors font-medium"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copiedCode ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>

                <div className="flex-1 bg-white dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800/50 rounded-2xl p-4 mb-6 overflow-y-auto flex flex-col gap-4 shadow-sm">
                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800/50 flex items-center justify-center">
                        <Send className="w-6 h-6 opacity-50" />
                      </div>
                      <p>No clips yet. Send something below!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={msg.id}
                        className={cn(
                          "max-w-[85%] rounded-2xl p-4 relative group",
                          msg.sender === 'me'
                            ? "bg-indigo-600 text-white self-end rounded-br-sm shadow-sm"
                            : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 self-start rounded-bl-sm shadow-sm"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                        <button
                          onClick={() => copyMessage(msg.text)}
                          className={cn(
                            "absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all",
                            msg.sender === 'me' ? "bg-indigo-700 hover:bg-indigo-800" : "bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                          )}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="Type or paste something..."
                    className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl py-4 pl-5 pr-16 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[60px] max-h-[200px] text-neutral-900 dark:text-white shadow-sm"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={inputText.trim().length === 0}
                    className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}