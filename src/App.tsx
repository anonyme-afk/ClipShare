import React, { useState, useEffect, useRef } from 'react';
import { Copy, Send, LogOut, Plus, LogIn, Check, Sun, Moon, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db } from './firebase';
import { ref, onValue, push, set, serverTimestamp, off, query, orderByChild, startAt, onDisconnect, remove } from 'firebase/database';

import { Image as ImageIcon, Paperclip, X } from 'lucide-react';
// Storage supprimé car nécessite un forfait payant dans certaines régions

type Message = {
  id: string;
  text?: string;
  imageUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  type: 'text' | 'image' | 'file';
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
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedGenericFile, setSelectedGenericFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genericFileInputRef = useRef<HTMLInputElement>(null);
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
              imageUrl: val.imageUrl,
              fileName: val.fileName,
              fileSize: val.fileSize,
              fileUrl: val.fileUrl,
              type: val.type || 'text',
              sender: val.senderId === SESSION_ID ? 'me' : 'other',
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim().length === 0 && !selectedFile && !selectedGenericFile) return;

    let finalImageUrl = '';
    let finalFileUrl = '';
    let isImage = false;
    let isGenericFile = false;
    let fileName = '';
    let fileSize = 0;
    
    if (selectedFile) {
      setUploading(true);
      setUploadProgress(20);
      try {
        const compressedBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(selectedFile);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 1920;
              const MAX_HEIGHT = 1920;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
              resolve(dataUrl);
            };
            img.onerror = reject;
          };
          reader.onerror = reject;
        });
        finalImageUrl = compressedBase64;
        isImage = true;
        setUploadProgress(100);
      } catch (err) {
        console.error("Erreur de traitement d'image:", err);
        setErrorMessage("Erreur lors de la compression de l'image.");
        setUploading(false);
        return;
      }
      setUploading(false);
      setSelectedFile(null);
      setImagePreview(null);
      setUploadProgress(0);
    } else if (selectedGenericFile) {
      if (selectedGenericFile.size > 7 * 1024 * 1024) {
        setErrorMessage("Le fichier est trop volumineux (max 7 Mo).");
        return;
      }
      setUploading(true);
      setUploadProgress(50);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(selectedGenericFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        finalFileUrl = base64;
        fileName = selectedGenericFile.name;
        fileSize = selectedGenericFile.size;
        isGenericFile = true;
        setUploadProgress(100);
      } catch (err) {
        console.error("Erreur de fichier:", err);
        setErrorMessage("Erreur lors de la préparation du fichier.");
        setUploading(false);
        return;
      }
      setUploading(false);
      setSelectedGenericFile(null);
      setUploadProgress(0);
    }

    const messagesRef = ref(db, `rooms/${roomCode}`);
    const newMsgRef = push(messagesRef);
    if (newMsgRef.key) {
      myMessageKeys.current.add(newMsgRef.key);
    }
    
    const msgData: any = {
      content: inputText.trim(),
      senderId: SESSION_ID,
      timestamp: serverTimestamp()
    };
    
    if (isImage) {
      msgData.type = 'image';
      msgData.imageUrl = finalImageUrl;
    } else if (isGenericFile) {
      msgData.type = 'file';
      msgData.fileUrl = finalFileUrl;
      msgData.fileName = fileName;
      msgData.fileSize = fileSize;
    } else {
      msgData.type = 'text';
    }

    set(newMsgRef, msgData).catch(err => {
      console.error("Erreur d'envoi:", err);
      setErrorMessage("Erreur d'envoi à la base de données.");
    });
    setInputText('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSelectedGenericFile(null); // Clear generic file if image selected
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenericFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 7 * 1024 * 1024) {
        setErrorMessage("Le fichier est trop volumineux (max 7 Mo).");
        return;
      }
      setSelectedGenericFile(file);
      setSelectedFile(null); // Clear image if generic file selected
      setImagePreview(null);
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

  const downloadImage = (base64: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `clipshare_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50 font-sans selection:bg-indigo-500/30 transition-colors duration-300">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 md:p-8 h-[100dvh] flex flex-col">
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
                className="flex-1 flex flex-col h-full overflow-hidden"
              >
                <div className="bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shrink-0">
                  <div className="text-center sm:text-left">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mb-1">Your Room Code</p>
                    <span className="text-3xl sm:text-4xl font-mono tracking-widest font-bold text-neutral-900 dark:text-white">
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
                
                <AnimatePresence>
                  {errorMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-xl mb-4 text-sm font-medium flex items-center justify-between"
                    >
                      <span>{errorMessage}</span>
                      <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-red-500/10 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 bg-white dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800/50 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 overflow-y-auto flex flex-col gap-4 shadow-sm relative min-h-0">
                  <div className="flex-1 flex flex-col gap-4">
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
                          {msg.type === 'image' && msg.imageUrl && (
                            <div className="mb-2 overflow-hidden rounded-xl">
                              <img 
                                src={msg.imageUrl} 
                                alt="Uploaded content" 
                                className="max-w-full h-auto object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                                onClick={() => setFullscreenImage(msg.imageUrl || null)}
                              />
                            </div>
                          )}
                          {msg.type === 'file' && msg.fileUrl && (
                            <div className="mb-2 p-3 bg-white/10 rounded-xl flex items-center justify-between border border-neutral-200/20 dark:border-white/10 shadow-sm">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                                        <Paperclip className="w-5 h-5 text-indigo-100" />
                                    </div>
                                    <div className="truncate">
                                        <p className="text-sm font-medium truncate">{msg.fileName}</p>
                                        <p className="text-xs opacity-70">{(msg.fileSize! / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = msg.fileUrl!;
                                        link.download = msg.fileName || 'download';
                                        link.click();
                                    }}
                                    className="p-2 ml-2 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            </div>
                          )}
                          {msg.text && (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.text.split(/(\s+)/).map((part, i) => {
                                const urlMatch = part.match(/^(https?:\/\/[^\s]+)$|^(https?:\/\/[^\s]+)([\.,!\?\)])$/);
                                if (urlMatch) {
                                  const url = urlMatch[1] || urlMatch[2];
                                  const punctuation = urlMatch[3] || '';
                                  return (
                                    <React.Fragment key={i}>
                                      <a 
                                        href={url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className={cn(
                                          "underline break-all",
                                          msg.sender === 'me' ? "text-indigo-200" : "text-indigo-600 dark:text-indigo-400"
                                        )}
                                      >
                                        {url}
                                      </a>
                                      {punctuation}
                                    </React.Fragment>
                                  );
                                }
                                return part;
                              })}
                            </p>
                          )}
                          <button
                            onClick={() => copyMessage(msg.text || '')}
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
                  </div>
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="relative space-y-2">
                  <AnimatePresence>
                    {(imagePreview || selectedGenericFile) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full mb-4 left-0 right-0 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl flex items-center gap-4"
                      >
                        {imagePreview ? (
                          <div className="w-20 h-20 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800">
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                            <Paperclip className="w-8 h-8 text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {selectedFile?.name || selectedGenericFile?.name}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {selectedGenericFile ? `${(selectedGenericFile.size / 1024 / 1024).toFixed(2)} MB - Ready to send` : 'Ready to send'}
                          </p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setSelectedGenericFile(null);
                            setImagePreview(null);
                          }}
                          className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                        >
                          <X className="w-5 h-5 text-neutral-500" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="relative flex items-end gap-2">
                    <div className="flex-1 relative">
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
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl py-4 pl-20 pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[60px] max-h-[200px] text-neutral-900 dark:text-white shadow-sm"
                        rows={1}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute left-3 bottom-3 p-2 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <ImageIcon className="w-5 h-5" />
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileSelect} 
                        className="hidden" 
                        accept="image/*"
                      />
                      <button
                        type="button"
                        onClick={() => genericFileInputRef.current?.click()}
                        className="absolute left-12 bottom-3 p-2 text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <input 
                        type="file" 
                        ref={genericFileInputRef} 
                        onChange={handleGenericFileSelect} 
                        className="hidden" 
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={(inputText.trim().length === 0 && !selectedFile && !selectedGenericFile) || uploading}
                      className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-[60px] w-[60px] flex items-center justify-center"
                    >
                      {uploading ? (
                        <div className="relative w-6 h-6 flex items-center justify-center">
                          <div className="absolute inset-0 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span className="text-[10px] font-bold">{Math.round(uploadProgress)}%</span>
                        </div>
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {fullscreenImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
              onClick={() => setFullscreenImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-full max-h-full flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                <img 
                  src={fullscreenImage} 
                  alt="Fullscreen" 
                  className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
                />
                <div className="flex gap-4">
                  <button
                    onClick={() => downloadImage(fullscreenImage)}
                    className="bg-white text-black px-6 py-3 rounded-2xl font-semibold flex items-center gap-2 hover:bg-neutral-200 transition-colors shadow-lg"
                  >
                    <Plus className="w-5 h-5 rotate-45" /> {/* Use Plus rotated for "Download" feel or simple icon */}
                    Download Image
                  </button>
                  <button
                    onClick={() => setFullscreenImage(null)}
                    className="bg-neutral-800 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-neutral-700 transition-colors shadow-lg"
                  >
                    Close
                  </button>
                </div>
                <button 
                  onClick={() => setFullscreenImage(null)}
                  className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-8 h-8" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}