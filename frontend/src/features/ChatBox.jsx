import React, { useState, useEffect, useRef } from 'react';
import {
  fetchRoomMessages,
  sendRoomMessage,
  fetchMessages,
  sendMessage,
  uploadImage,
  subscribeToMessages,
  reactToMessage,
  muteMember,
  banMember
} from '../services/chat';
import { compressImage } from '../utils/compression';
import { isImageUrl } from '../utils/regex';
import Button from '../components/Button';
import ModerationDrawer from './ModerationDrawer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

const EMOJIS_DISPONIVEIS = ['👍', '❤️', '😂', '🔥', '🚀'];

export default function ChatBox({
  user,
  activeRoom,
  onLogout,
  onToggleSidebar,
  roomMembers = []
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [imagemAmpliada, setImagemAmpliada] = useState(null);
  const [isModDrawerOpen, setIsModDrawerOpen] = useState(false);
  const [members, setMembers] = useState(roomMembers);
  const [userRole, setUserRole] = useState('padrao');
  const [isUserMuted, setIsUserMuted] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPlacement, setMenuPlacement] = useState('up'); // 'up' | 'down'

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fechar menu contextual ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Manipulador para posicionamento dinâmico (anti-colisão) do menu contextual
  const handleToggleMenu = (e, msgId) => {
    e.stopPropagation();

    if (activeMenuId === msgId) {
      setActiveMenuId(null);
      return;
    }

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 175; // Altura aproximada do menu com emojis e botões

    // Mede a distância até o topo do container com scroll e o topo da janela
    const container = e.currentTarget.closest('.overflow-y-auto');
    const containerTop = container ? container.getBoundingClientRect().top : 0;
    const spaceAbove = buttonRect.top - containerTop;

    // Se o espaço acima for menor que a altura do menu, abre para baixo ('down'), caso contrário para cima ('up')
    if (spaceAbove < dropdownHeight || buttonRect.top < dropdownHeight) {
      setMenuPlacement('down');
    } else {
      setMenuPlacement('up');
    }

    setActiveMenuId(msgId);
  };

  const roomId = activeRoom?.id || user?.sala_id;
  const roomTitle = activeRoom?.titulo || activeRoom?.nome_url || user?.nome_url || 'Chat';

  // Sincroniza membros e permissões do usuário logado na sala ativa
  useEffect(() => {
    if (user?.is_site_admin) {
      setUserRole('admin');
      setIsUserMuted(false);
      return;
    }

    if (user?.is_muted_global) {
      setIsUserMuted(true);
    }

    const currentMember = roomMembers.find(
      (m) => m.usuario_id === user?.id || m.nickname === user?.nickname
    );

    if (currentMember) {
      setUserRole(currentMember.role || 'padrao');
      setIsUserMuted(currentMember.is_muted || user?.is_muted_global || false);
    } else {
      setUserRole(user?.role || 'padrao');
      setIsUserMuted(user?.is_muted || false);
    }
    setMembers(roomMembers);
  }, [roomMembers, user, activeRoom]);

  // Solicita permissão de notificação push
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notifyNewMessage = (msg) => {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(`Nova mensagem em #${roomTitle}`, {
        body: `${msg.autor_nickname}: ${msg.conteudo.slice(0, 80)}`,
        icon: '/favicon.ico',
      });
    }
  };

  // Carrega mensagens e conecta ao stream SSE da sala
  useEffect(() => {
    if (!roomId) return;

    const loadMessages = async () => {
      try {
        const data = activeRoom?.id
          ? await fetchRoomMessages(roomId)
          : await fetchMessages();
        setMessages(data);
      } catch (err) {
        console.error("Erro ao carregar mensagens:", err);
      }
    };

    loadMessages();

    const unsubscribe = subscribeToMessages((eventData) => {
      // Atualização de reações
      if (eventData.type === "reaction_update") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === eventData.message_id ? { ...m, reacoes: eventData.reacoes } : m
          )
        );
        return;
      }

      // Mensagem nova
      const newMessage = eventData;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      notifyNewMessage(newMessage);
    }, roomId);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId, activeRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Envio de mensagem
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending || isUserMuted || userRole === 'view') return;

    const textToSend = input.trim();
    const replyId = replyingTo ? replyingTo.id : null;

    setInput('');
    setReplyingTo(null);

    try {
      setSending(true);
      if (activeRoom?.id) {
        await sendRoomMessage(activeRoom.id, textToSend, replyId);
      } else {
        await sendMessage(textToSend, replyId);
      }
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      alert(err.message || "Falha ao enviar mensagem.");
      setInput(textToSend);
    } finally {
      setSending(false);
    }
  };

  // Upload com compressão client-side
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isUserMuted || userRole === 'view') return;

    try {
      setUploading(true);
      const compressed = await compressImage(file);
      const { url } = await uploadImage(compressed);
      if (activeRoom?.id) {
        await sendRoomMessage(activeRoom.id, url, replyingTo ? replyingTo.id : null);
      } else {
        await sendMessage(url, replyingTo ? replyingTo.id : null);
      }
      setReplyingTo(null);
    } catch (err) {
      console.error("Erro no upload de imagem:", err);
      alert(err.message || "Erro no upload.");
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

  const handleReaction = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji);
    } catch (err) {
      console.error("Erro ao reagir:", err);
    }
  };

  const copiarTexto = (texto) => {
    navigator.clipboard.writeText(texto);
    alert("Mensagem copiada para a área de transferência!");
  };

  const handleMuteAction = async (targetUserId, shouldMute) => {
    if (!activeRoom?.id) return;
    try {
      await muteMember(activeRoom.id, targetUserId, shouldMute);
      setMembers((prev) =>
        prev.map((m) =>
          m.usuario_id === targetUserId ? { ...m, is_muted: shouldMute } : m
        )
      );
      if (targetUserId === user?.id) {
        setIsUserMuted(shouldMute);
      }
    } catch (err) {
      alert(err.message || "Erro ao atualizar mute.");
    }
  };

  const handleBanAction = async (targetUserId) => {
    if (!activeRoom?.id) return;
    if (!window.confirm("Deseja realmente banir este membro da sala?")) return;
    try {
      await banMember(activeRoom.id, targetUserId);
      setMembers((prev) => prev.filter((m) => m.usuario_id !== targetUserId));
    } catch (err) {
      alert(err.message || "Erro ao banir membro.");
    }
  };

  const isCanModerate = userRole === 'admin' || userRole === 'mod' || user?.is_site_admin;
  const isInputDisabled = isUserMuted || userRole === 'view' || sending;

  return (
    <div className="flex flex-col h-[88vh] w-full max-w-5xl mx-auto bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header do Chat */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
              title="Abrir lista de canais"
            >
              ☰
            </button>
          )}

          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">#{roomTitle}</h2>
              {activeRoom?.tipo_sala === 'temporaria' && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Efêmera (TTL)
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span>Conectado como</span>
              <span className="text-emerald-400 font-semibold">{user?.nickname}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-zinc-800 text-zinc-300 uppercase">
                {userRole}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCanModerate && (
            <button
              onClick={() => setIsModDrawerOpen(true)}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all flex items-center gap-1.5"
            >
              <span>🛡️</span>
              <span className="hidden sm:inline">Moderação</span>
            </button>
          )}

          <Button variant="secondary" onClick={onLogout} className="text-xs py-1.5 px-3">
            Sair
          </Button>
        </div>
      </div>

      {/* Lista de Mensagens */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs py-12">
            <span className="text-3xl mb-2">💬</span>
            <p>Nenhuma mensagem ainda neste canal.</p>
            <p className="text-zinc-600">Seja o primeiro a iniciar a conversa!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const isSameAuthor = prevMsg && prevMsg.autor_nickname === msg.autor_nickname;
            const timeDiff = prevMsg
              ? (new Date(msg.created_at) - new Date(prevMsg.created_at)) / (1000 * 60)
              : 999;
            const isConsecutive = isSameAuthor && timeDiff < 3 && !msg.reply_to_id;
            const isMe = msg.autor_nickname === user?.nickname;
            const isImage = isImageUrl(msg.conteudo.trim());
            const mensagemOriginal = msg.reply_to_id
              ? messages.find((m) => m.id === msg.reply_to_id)
              : null;

            return (
              <div
                key={msg.id}
                className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start'} ${
                  isConsecutive ? 'mt-1' : 'mt-4 first:mt-0'
                }`}
              >
                {/* Nome do autor com Badges de cargo (apenas se não for consecutiva) */}
                {!isConsecutive && (
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-medium text-zinc-400">
                    <span>{msg.autor_nickname}</span>
                    {/* Badge de Cargo se admin ou mod */}
                    {members.find((m) => m.nickname === msg.autor_nickname)?.role === 'admin' && (
                      <span className="text-[9px] px-1 py-0.2 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ADMIN
                      </span>
                    )}
                    {members.find((m) => m.nickname === msg.autor_nickname)?.role === 'mod' && (
                      <span className="text-[9px] px-1 py-0.2 rounded-full font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        MOD
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Linha do Balão com Botão de Ações (...) */}
                <div
                  className={`relative flex items-center gap-1.5 group/msg max-w-[85%] ${
                    isMe ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Balão da Mensagem */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm relative shadow-md ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-xs border border-zinc-700/60'
                    }`}
                  >
                    {/* Citação / Resposta */}
                    {mensagemOriginal && (
                      <div className="mb-2 p-2 rounded bg-black/25 border-l-2 border-emerald-400 text-xs text-zinc-300">
                        <span className="font-semibold block text-emerald-300">
                          {mensagemOriginal.autor_nickname}
                        </span>
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
                          rehypePlugins={[rehypeSanitize]}
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
                            a: ({ node, ...props }) => (
                              <a
                                className="text-emerald-300 hover:underline font-medium"
                                target="_blank"
                                rel="noopener noreferrer"
                                {...props}
                              />
                            ),
                            code: ({ node, inline, ...props }) =>
                              inline ? (
                                <code className="bg-black/30 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[13px]" {...props} />
                              ) : (
                                <pre className="bg-black/40 p-3 rounded-md overflow-x-auto my-2 border border-zinc-700/50">
                                  <code className="font-mono text-[13px] text-zinc-200" {...props} />
                                </pre>
                              ),
                          }}
                        >
                          {msg.conteudo}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* Reações com Emojis */}
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
                              <span className="font-bold text-[10px]">{usuarios.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Botão de Gatilho '...' com Dropdown Popover */}
                  <div className="relative flex items-center">
                    <button
                      onClick={(e) => handleToggleMenu(e, msg.id)}
                      className="opacity-0 max-sm:opacity-70 group-hover/msg:opacity-100 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all cursor-pointer"
                      title="Mais opções"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                      </svg>
                    </button>

                    {/* Dropdown Menu Suspenso com Posicionamento Dinâmico */}
                    {activeMenuId === msg.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute z-50 bg-zinc-950/95 border border-zinc-800 rounded-xl shadow-2xl p-2 min-w-[170px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
                          isMe ? 'right-0' : 'left-0'
                        } ${
                          menuPlacement === 'up'
                            ? 'bottom-full mb-2'
                            : 'top-full mt-2'
                        }`}
                      >
                        {/* Emojis Rápidos */}
                        <div className="flex items-center justify-between gap-1 px-1 py-1 mb-1">
                          {EMOJIS_DISPONIVEIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleReaction(msg.id, emoji);
                                setActiveMenuId(null);
                              }}
                              className="hover:scale-125 transition-transform text-sm cursor-pointer p-1"
                              title={`Reagir com ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>

                        <div className="border-t border-zinc-800/80 my-1" />

                        {/* Opção Responder */}
                        {!isUserMuted && userRole !== 'view' && (
                          <button
                            onClick={() => {
                              setReplyingTo(msg);
                              setActiveMenuId(null);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer text-left"
                          >
                            <span>↩️</span>
                            <span>Responder</span>
                          </button>
                        )}

                        {/* Opção Copiar */}
                        <button
                          onClick={() => {
                            copiarTexto(msg.conteudo);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <span>📋</span>
                          <span>Copiar mensagem</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Banners Condicionais de Permissão */}
      {userRole === 'view' && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <span>👁️</span>
          <span>
            <strong>Modo Somente Leitura:</strong> você possui cargo <em>View</em>. Pode acompanhar conversas e reagir com emojis, mas não pode enviar mensagens ou anexos.
          </span>
        </div>
      )}

      {isUserMuted && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <span>🔇</span>
          <span>
            <strong>Silenciado:</strong> Você está mutado nesta sala e impedido de postar. Fale com um moderador da sala.
          </span>
        </div>
      )}

      {/* Área de Input */}
      <div className="flex flex-col border-t border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
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

        <form onSubmit={handleSend} className="p-3.5 flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
            disabled={isInputDisabled}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled || uploading}
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={isInputDisabled ? "Envio desativado para seu cargo" : "Enviar Imagem (Comprimida client-side)"}
          >
            {uploading ? '⏳' : '📷'}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isInputDisabled}
            placeholder={
              isUserMuted
                ? "Você está silenciado nesta sala."
                : userRole === 'view'
                ? "Modo apenas visualização (View)."
                : replyingTo
                ? "Digite sua resposta..."
                : "Digite sua mensagem... (Markdown suportado)"
            }
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none min-h-[42px] max-h-28 overflow-y-auto disabled:opacity-40 disabled:cursor-not-allowed"
            rows="1"
          />

          <Button
            type="submit"
            disabled={isInputDisabled || !input.trim()}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? '...' : 'Enviar'}
          </Button>
        </form>
      </div>

      {/* Drawer de Moderação */}
      <ModerationDrawer
        isOpen={isModDrawerOpen}
        onClose={() => setIsModDrawerOpen(false)}
        activeRoom={activeRoom}
        members={members}
        currentUserRole={userRole}
        onMuteMember={handleMuteAction}
        onBanMember={handleBanAction}
      />

      {/* Lightbox / Imagem Ampliada */}
      {imagemAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 cursor-zoom-out"
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
              className="absolute -top-3 -right-3 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}