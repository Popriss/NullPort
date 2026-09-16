import React, { useState, useEffect, useRef } from 'react';
import { fetchMessages, sendMessage, uploadImage, subscribeToMessages, reactToMessage } from '../services/chat';
import { compressImage } from '../utils/compression';
import { isImageUrl } from '../utils/regex';
import Button from '../components/Button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const EMOJIS_DISPONIVEIS = ['👍', '❤️', '😂', '🔥', '🚀'];

export default function ChatBox({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // Guarda a mensagem sendo respondida
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [imagemAmpliada, setImagemAmpliada] = useState(null);

  // Solicitar permissão de notificação push
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notifyNewMessage = (msg) => {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(`Nova mensagem de ${msg.autor_nickname}`, {
        body: msg.conteudo.slice(0, 100),
        icon: '/favicon.ico',
      });
    }
  };

  // Carregar histórico e assinar SSE (tratando novas mensagens e reações)
  useEffect(() => {
    fetchMessages()
      .then((data) => setMessages(data))
      .catch((err) => console.error("Erro ao carregar mensagens:", err));

    const unsubscribe = subscribeToMessages((eventData) => {
      // Se for uma atualização de reação
      if (eventData.type === "reaction_update") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === eventData.message_id ? { ...m, reacoes: eventData.reacoes } : m
          )
        );
        return;
      }

      // Se for uma mensagem nova
      const newMessage = eventData;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      notifyNewMessage(newMessage);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const textToSend = input.trim();
    const replyId = replyingTo ? replyingTo.id : null;
    
    setInput('');
    setReplyingTo(null); // Limpa o modo resposta

    try {
      setSending(true);
      await sendMessage(textToSend, replyId);
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setInput(textToSend);
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const compressed = await compressImage(file);
      const { url } = await uploadImage(compressed);
      await sendMessage(url, replyingTo ? replyingTo.id : null);
      setReplyingTo(null);
    } catch (err) {
      console.error("Erro no upload de imagem:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const copiarTexto = (texto) => {
    navigator.clipboard.writeText(texto);
    alert("Mensagem copiada!");
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji);
    } catch (err) {
      console.error("Erro ao reagir:", err);
    }
  };

  // Função auxiliar para achar a mensagem original que está sendo respondida
  const encontrarMensagemOriginal = (replyId) => {
    return messages.find((m) => m.id === replyId);
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
          const mensagemOriginal = msg.reply_to_id ? encontrarMensagemOriginal(msg.reply_to_id) : null;

          return (
            <div key={msg.id} className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-[11px] font-medium text-zinc-500 mb-1 px-1">
                {msg.autor_nickname} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>

              {/* Balão da Mensagem */}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm relative ${
                  isMe
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-xs border border-zinc-700/60'
                }`}
              >
                {/* Se for uma resposta, exibe a prévia da mensagem citada */}
                {mensagemOriginal && (
                  <div className="mb-2 p-2 rounded bg-black/20 border-l-2 border-emerald-400 text-xs text-zinc-300">
                    <span className="font-semibold block text-emerald-300">{mensagemOriginal.autor_nickname}</span>
                    <p className="truncate">{mensagemOriginal.conteudo}</p>
                  </div>
                )}

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
                        img: ({ node, ...props }) => (
                          <img
                            {...props}
                            className="max-w-sm rounded-lg my-2 shadow-md cursor-zoom-in hover:opacity-90 transition-opacity"
                            loading="lazy"
                            onClick={() => setImagemAmpliada(props.src)}
                          />
                        ),
                        p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
                        a: ({ node, ...props }) => <a className="text-emerald-300 hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
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

                {/* Exibição das Reações em baixo do balão */}
                {msg.reacoes && Object.keys(msg.reacoes).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(msg.reacoes).map(([emoji, usuarios]) => {
                      const usuarioReagiu = usuarios.includes(user?.nickname);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(msg.id, emoji)}
                          title={usuarios.join(', ')}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            usuarioReagiu 
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200' 
                              : 'bg-zinc-900/60 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="font-bold">{usuarios.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Barra de Ações Rápidas Flutuantes (Hover) */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 mt-1 text-[11px] text-zinc-400 px-1">
                {/* Emojis Rápidos */}
                <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5 shadow-md">
                  {EMOJIS_DISPONIVEIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(msg.id, emoji)}
                      className="hover:scale-125 transition-transform cursor-pointer"
                      title={`Reagir com ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Botão de Responder */}
                <button
                  onClick={() => setReplyingTo(msg)}
                  className="hover:text-emerald-400 transition-colors cursor-pointer bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 shadow-md"
                >
                  Responder
                </button>

                {/* Botão de Copiar */}
                <button 
                  onClick={() => copiarTexto(msg.conteudo)}
                  className="hover:text-emerald-400 transition-colors cursor-pointer bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 shadow-md"
                >
                  Copiar
                </button>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar & Preview de Resposta */}
      <div className="flex flex-col border-t border-zinc-800 bg-zinc-950/60">
        {/* Banner de "Respondendo a..." */}
        {replyingTo && (
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 text-xs text-zinc-300">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-emerald-400">Respondendo a {replyingTo.autor_nickname}:</span>
              <span className="truncate text-zinc-400">{replyingTo.conteudo}</span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-zinc-500 hover:text-zinc-200 font-bold px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="p-4 flex items-center gap-3">
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
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
            title="Enviar Imagem"
          >
            {uploading ? '⏳' : '📷'}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyingTo ? "Digite sua resposta..." : "Digite sua mensagem..."}
            className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none min-h-[44px] max-h-32 overflow-y-auto"
            rows="1"
          />

          <Button type="submit" disabled={sending || !input.trim()}>
            {sending ? '...' : 'Enviar'}
          </Button>
        </form>
      </div>

      {/* Modal de Imagem Ampliada */}
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
              click={() => setImagemAmpliada(null)}
              onClick={() => setImagemAmpliada(null)}
              className="absolute -top-4 -right-4 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-colors cursor-pointer"
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