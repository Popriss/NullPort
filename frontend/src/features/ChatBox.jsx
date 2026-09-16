import React, { useState, useEffect, useRef } from 'react';
import { fetchMessages, sendMessage, uploadImage, subscribeToMessages } from '../services/chat';
import { compressImage } from '../utils/compression';
import { isImageUrl } from '../utils/regex';
import Button from '../components/Button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatBox({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [imagemAmpliada, setImagemAmpliada] = useState(null);

  // Solicitar permissão de notificação push
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Notificação push se a aba estiver inativa
  const notifyNewMessage = (msg) => {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(`Nova mensagem de ${msg.autor_nickname}`, {
        body: msg.conteudo.slice(0, 100),
        icon: '/favicon.ico',
      });
    }
  };

  // Carregar histórico inicial e assinar SSE
  useEffect(() => {
    fetchMessages()
      .then((data) => setMessages(data))
      .catch((err) => console.error("Erro ao carregar mensagens:", err));

    const unsubscribe = subscribeToMessages((newMessage) => {
      setMessages((prev) => {
        // Evita duplicatas se a mensagem já estiver no estado
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      notifyNewMessage(newMessage);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Rolagem automática para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const textToSend = input.trim();
    setInput('');
    try {
      setSending(true);
      await sendMessage(textToSend);
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setInput(textToSend); // Restaura texto se falhar
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      // Compressão client-side obrigatória (< 1MB)
      const compressed = await compressImage(file);
      const { url } = await uploadImage(compressed);
      // Envia a URL da imagem como mensagem no chat
      await sendMessage(url);
    } catch (err) {
      console.error("Erro no upload de imagem:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    // Se apertar Enter SEM o Shift, envia a mensagem
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Evita que ele pule a linha antes de enviar
      handleSend(e);
    }
  };

  const copiarTexto = (texto) => {
    navigator.clipboard.writeText(texto);
    // Um alert simples só para testar, depois podemos colocar um Toast bonitão
    alert("Mensagem copiada!");
  };

  return (
    <div className="flex flex-col h-[85vh] w-full max-w-4xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">#{user?.nome_url}</h2>
            <p className="text-xs text-zinc-500">Conectado como <span className="text-emerald-400 font-medium">{user?.nickname}</span></p>
          </div>
        </div>
        <Button variant="secondary" onClick={onLogout} className="text-xs py-1.5 px-3">
          Sair
        </Button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.autor_nickname === user?.nickname;
          const isImage = isImageUrl(msg.conteudo.trim());

          return (
              <div key={msg.id} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>              <span className="text-[11px] font-medium text-zinc-500 mb-1 px-1">
                {msg.autor_nickname} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMe
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-xs border border-zinc-700/60'
                }`}
              >
                {isImage ? (
                  <img
                    src={msg.conteudo.trim()}
                    alt="Anexo de mídia"
                    className="rounded-lg max-h-80 w-auto object-cover hover:opacity-95 cursor-zoom-in"
                    onClick={() => setImagemAmpliada(msg.conteudo.trim())}
                  />
                ) : (
                  <div className="text-sm break-words whitespace-pre-wrap">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Garante que imagens em Markdown também abram no visualizador
                        img: ({ node, ...props }) => (
                          <img
                            {...props}
                            className="max-w-sm rounded-lg my-2 shadow-md cursor-zoom-in hover:opacity-90 transition-opacity"
                            loading="lazy"
                            onClick={() => setImagemAmpliada(props.src)}
                          />
                        ),
                        p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
                        a: ({ node, ...props }) => <a className="text-emerald-400 hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                        code: ({ node, inline, ...props }) => 
                          inline ? (
                            <code className="bg-black/30 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[13px]" {...props} />
                          ) : (
                            <pre className="bg-black/40 p-3 rounded-md overflow-x-auto my-2 border border-zinc-700/50"><code className="font-mono text-[13px] text-zinc-200" {...props} /></pre>
                          )
                      }}
                    >
                      {msg.conteudo}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              <button 
                onClick={() => copiarTexto(msg.conteudo)}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-emerald-400 transition-opacity mt-1 cursor-pointer"
              >
                Copiar
              </button>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center gap-3">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          title="Enviar Imagem"
        >
          {uploading ? '⏳' : '📷'}
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none min-h-[44px] max-h-32 overflow-y-auto"
          rows="1"
        />

        <Button type="submit" disabled={sending || !input.trim()}>
          {sending ? '...' : 'Enviar'}
        </Button>
      </form>
      {imagemAmpliada && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out transition-all"
          onClick={() => setImagemAmpliada(null)} 
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <img
              src={imagemAmpliada}
              alt="Ampliada"
              className="w-auto h-auto max-w-full max-h-[90vh] rounded-lg shadow-2xl cursor-default"
              onClick={(e) => e.stopPropagation()} 
            />
            <button
              onClick={() => setImagemAmpliada(null)}
              className="absolute -top-4 -right-4 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-colors"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
