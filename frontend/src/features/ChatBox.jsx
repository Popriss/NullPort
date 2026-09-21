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
  banMember,
  fetchRoomMembers,
  updateMemberRole,
  sendTyping,
  markMessageRead,
  markMessageDelivered,
  submitReport
} from '../services/chat';
import { compressImage } from '../utils/compression';
import { isImageUrl, isAudioUrl, isPdfUrl } from '../utils/regex';
import { initScreenProtection } from '../utils/screenProtection';
import { parseUtcDate, formatMessageTime, formatMessageDateTime, formatDateDivider, isSameDay } from '../utils/date';
import Button from '../components/Button';
import ModerationDrawer from './ModerationDrawer';
import ViewOnceModal from './ViewOnceModal';
import SecuritySettingsModal from './SecuritySettingsModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

const EMOJIS_DISPONIVEIS = ['👍', '❤️', '😂', '🔥', '🚀'];

// Helper para detecção e destaque visual de menções @nickname (chip verde esmeralda)
const renderWithMentions = (child) => {
  if (typeof child === 'string') {
    const parts = child.split(/(@[a-zA-Z0-9_.-]+)/g);
    if (parts.length === 1) return child;
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono shadow-xs"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  }
  if (Array.isArray(child)) {
    return child.map((c, i) => <React.Fragment key={i}>{renderWithMentions(c)}</React.Fragment>);
  }
  return child;
};

// Sintetizador de áudio discreto para menção via Web Audio API
const playMentionChime = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (e) {
    console.debug("Audio mention chime skipped:", e);
  }
};


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
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // Estados para UX, Toasts, SSE e Drag-and-Drop
  const [toasts, setToasts] = useState([]);
  const [sseStatus, setSseStatus] = useState('connecting'); // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);

  // Estados V3 para Indicador de Digitação (Typing Indicator)
  const [typingUsers, setTypingUsers] = useState({}); // { [nickname]: timestamp }
  const typingTimeoutRef = useRef(null);

  // Estados PRD Avançados (RF01-RF07, RN01-RN07)
  const [ttlSeconds, setTtlSeconds] = useState(null); // RF04: TTL pós-leitura
  const [isViewOnce, setIsViewOnce] = useState(false); // RF07: Mídia de visualização única
  const [activeViewOnceId, setActiveViewOnceId] = useState(null); // RF07: Modal de visualização
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false); // RF01/RN06: Central de segurança

  // Estados de Paginação e Histórico Progressivo (Scroll Infinito para cima)
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const isPrependingRef = useRef(false);
  const activeRoomRef = useRef(activeRoom);
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  const showScrollBottomButtonRef = useRef(showScrollBottomButton);
  useEffect(() => {
    showScrollBottomButtonRef.current = showScrollBottomButton;
  }, [showScrollBottomButton]);

  // RN02: Inicialização da proteção de tela e anti-captura web
  useEffect(() => {
    const cleanup = initScreenProtection();
    return cleanup;
  }, []);

  // RF04: Purga visual em tempo real no cliente para mensagens cujo TTL expirou
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const active = prev.filter((m) => {
          if (!m.expires_at) return true;
          const exp = parseUtcDate(m.expires_at);
          return exp ? exp.getTime() > now : true;
        });
        return active.length !== prev.length ? active : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // RF05: Confirmação automática de leitura quando as mensagens são visualizadas na tela
  useEffect(() => {
    if (document.hasFocus() && messages.length > 0) {
      messages.forEach((m) => {
        if (m.autor_nickname !== user?.nickname && m.status_recibo !== 'read') {
          markMessageRead(m.id);
        }
      });
    }
  }, [messages, user]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const scrollRafRef = useRef(null);

  // Expiração automática de 3 segundos do indicador 'digitando...'
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let changed = false;
        const updated = {};
        for (const [nick, timestamp] of Object.entries(prev)) {
          if (now - timestamp < 3000) {
            updated[nick] = timestamp;
          } else {
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Registro do Service Worker para Web Push API nativa em background
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.debug('Service Worker não registrado:', err);
      });
    }
  }, []);

  // Helper de Notificações Toast Modernas

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Scroll suave não-bloqueante throttled com requestAnimationFrame
  const scrollToBottom = (smooth = true) => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end'
      });
    });
  };

  const handleMessagesScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (isNearBottom) {
      setShowScrollBottomButton(false);
      setUnreadBelowCount(0);
    } else {
      setShowScrollBottomButton(true);
    }

    // Scroll infinito para cima: carrega mensagens anteriores ao se aproximar do topo
    if (scrollTop < 80 && hasMore && !loadingMore) {
      loadOlderMessages();
    }
  };

  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0 || !roomId) return;
    setLoadingMore(true);

    const oldestMsg = messages[0];
    const container = messagesContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    try {
      const olderData = activeRoom?.id
        ? await fetchRoomMessages(roomId, 100, oldestMsg.id)
        : await fetchMessages(100, oldestMsg.id);

      if (olderData && olderData.length > 0) {
        isPrependingRef.current = true;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOlder = olderData.filter((m) => !existingIds.has(m.id));
          return [...newOlder, ...prev];
        });

        // Preserva com precisão milimétrica a posição do scroll sem saltos visuais
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
          }
        });

        if (olderData.length < 100) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Erro ao carregar mensagens anteriores:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScrollToMessage = (targetId) => {
    if (!targetId) return;

    const element = document.getElementById(`msg-${targetId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Ativa o destaque temporário
      setHighlightedMessageId(targetId);

      // Remove o destaque após 1.8 segundos
      setTimeout(() => {
        setHighlightedMessageId((current) => (current === targetId ? null : current));
      }, 1800);
    }
  };

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

  // Função para buscar membros cadastrados da sala e sincronizar presença
  const loadRoomMembers = async () => {
    if (!roomId) return;
    try {
      const data = await fetchRoomMembers(roomId);
      setMembers(data);

      const currentMember = data.find(
        (m) => m.usuario_id === user?.id || m.id === user?.id || m.nickname === user?.nickname
      );

      if (user?.is_site_admin) {
        setUserRole('admin');
        setIsUserMuted(false);
      } else if (currentMember) {
        setUserRole(currentMember.role || 'padrao');
        setIsUserMuted(currentMember.is_muted || user?.is_muted_global || false);
      } else {
        setUserRole(user?.role || 'padrao');
        setIsUserMuted(user?.is_muted || false);
      }
    } catch (err) {
      console.error("Erro ao carregar membros da sala:", err);
    }
  };

  // Sincroniza membros e permissões do usuário logado na sala ativa
  useEffect(() => {
    if (user?.is_site_admin) {
      setUserRole('admin');
      setIsUserMuted(false);
    } else if (user?.is_muted_global) {
      setIsUserMuted(true);
    }

    if (roomId) {
      loadRoomMembers();
    }
  }, [roomId, user]);

  // Solicita permissão de notificação push
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notifyNewMessage = (msg) => {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      // RN05: Notificações cegas do SO para chats efêmeros e secretos
      const isBlind = msg.is_secret_mode || activeRoomRef.current?.is_secret_mode || Boolean(msg.ttl_seconds) || msg.is_view_once;
      const notifTitle = isBlind ? 'NullPort' : `Nova mensagem em #${roomTitle}`;
      const notifBody = isBlind ? 'Nova mensagem confidencial recebida.' : `${msg.autor_nickname}: ${msg.conteudo.slice(0, 80)}`;

      new Notification(notifTitle, {
        body: notifBody,
        icon: '/favicon.svg',
      });
    }
  };

  // Carrega mensagens e conecta ao stream SSE da sala
  useEffect(() => {
    if (!roomId) return;

    const loadMessages = async () => {
      try {
        const data = await fetchRoomMessages(roomId, 100);
        setMessages(data);
        setHasMore(data.length >= 100);
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

      // Atualização de presença em tempo real (Online vs Offline)
      if (eventData.type === "presence_update") {
        setMembers((prev) =>
          prev.map((m) =>
            (m.usuario_id === eventData.user_id || m.id === eventData.user_id)
              ? { ...m, is_online: eventData.is_online }
              : m
          )
        );
        return;
      }

      // Atualização de cargo ou mute de membro
      if (eventData.type === "member_update") {
        const updated = eventData.member;
        setMembers((prev) => {
          const exists = prev.some((m) => (m.usuario_id === updated.usuario_id || m.id === updated.id));
          if (exists) {
            return prev.map((m) =>
              (m.usuario_id === updated.usuario_id || m.id === updated.id)
                ? { ...m, ...updated }
                : m
            );
          }
          return [...prev, updated];
        });

        if (updated.usuario_id === user?.id || updated.id === user?.id) {
          if (!user?.is_site_admin) {
            setUserRole(updated.role || 'padrao');
            setIsUserMuted(updated.is_muted || false);
          }
        }
        return;
      }

      // Remoção / Ban de membro
      if (eventData.type === "member_removed") {
        setMembers((prev) =>
          prev.filter((m) => m.usuario_id !== eventData.user_id && m.id !== eventData.user_id)
        );
        if (eventData.user_id === user?.id) {
          showToast("Você foi removido desta sala por um administrador.", "error");
          setTimeout(() => window.location.reload(), 1800);
        }
        return;
      }

      // Indicador Efêmero de Digitação (Typing Indicator)
      if (eventData.type === "typing") {
        if (eventData.nickname && eventData.nickname !== user?.nickname) {
          if (eventData.is_typing) {
            setTypingUsers((prev) => ({
              ...prev,
              [eventData.nickname]: Date.now()
            }));
          } else {
            setTypingUsers((prev) => {
              const copy = { ...prev };
              delete copy[eventData.nickname];
              return copy;
            });
          }
        }
        return;
      }

      // RF05: Confirmação de Leitura (Ticks ✓✓ esmeralda)
      if (eventData.type === "message_read") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === eventData.message_id ? { ...m, status_recibo: 'read' } : m
          )
        );
        return;
      }

      // RF05: Confirmação de Entrega (Ticks ✓✓ cinza)
      if (eventData.type === "message_delivered") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === eventData.message_id && m.status_recibo !== 'read'
              ? { ...m, status_recibo: 'delivered' }
              : m
          )
        );
        return;
      }

      // RF04: Gatilho de Autodestruição pós-leitura (Início do TTL)
      if (eventData.type === "ttl_started") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === eventData.message_id
              ? { ...m, expires_at: eventData.expires_at, ttl_seconds: eventData.ttl_seconds }
              : m
          )
        );
        return;
      }

      // RN03 / RF07: Retenção Zero / Hard Wipe de mensagem/mídia em tempo real
      if (eventData.type === "message_destroyed") {
        setMessages((prev) => prev.filter((m) => m.id !== eventData.message_id));
        return;
      }

      // Mensagem nova
      const newMessage = eventData;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });

      // Se o usuário logado foi mencionado com @nickname, toca sinal sonoro suave e emite toast
      if (user?.nickname && newMessage.autor_nickname !== user.nickname && newMessage.conteudo) {
        const mentionRegex = new RegExp(`@${user.nickname}\\b`, 'i');
        if (mentionRegex.test(newMessage.conteudo)) {
          playMentionChime();
          showToast(`Você foi mencionado por @${newMessage.autor_nickname}!`, 'info');
        }
      }

      if (showScrollBottomButtonRef.current) {
        setUnreadBelowCount((prev) => prev + 1);
      }

      notifyNewMessage(newMessage);

    }, roomId, (status) => {
      setSseStatus(status);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]);

  // Scroll automático inteligente throttled e não-bloqueante
  useEffect(() => {
    if (messages.length === 0) return;

    // Se estivermos anexando mensagens antigas ao topo, ignora o auto-scroll para baixo
    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      return;
    }

    if (isInitialLoadRef.current) {
      scrollToBottom(false);
      isInitialLoadRef.current = false;
    } else if (!showScrollBottomButton) {
      scrollToBottom(true);
    }

    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [messages, showScrollBottomButton]);

  // Ao mudar de sala, prepara o carregamento inicial instantâneo
  useEffect(() => {
    isInitialLoadRef.current = true;
    setShowScrollBottomButton(false);
    setUnreadBelowCount(0);
    setHasMore(true);
    setLoadingMore(false);
  }, [roomId]);

  // Disparo com debounce (300ms) de digitação no servidor
  const handleInputChange = (e) => {
    setInput(e.target.value);

    if (roomId && user?.nickname && userRole !== 'view' && !isUserMuted) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(roomId, true);
      }, 300);
    }
  };

  // Envio de mensagem
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending || isUserMuted || userRole === 'view') return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (roomId) {
      sendTyping(roomId, false);
    }

    const textToSend = input.trim();
    const replyId = replyingTo ? replyingTo.id : null;

    setInput('');
    setReplyingTo(null);

    try {
      setSending(true);

      const targetRoomId = roomId || activeRoom?.id || user?.sala_id;
      if (!targetRoomId) {
        showToast("Selecione uma sala para enviar sua mensagem.", "warning");
        return;
      }

      await sendRoomMessage(targetRoomId, textToSend, replyId, {
        ttl_seconds: ttlSeconds,
        is_view_once: isViewOnce,
        is_secret_mode: activeRoom?.is_secret_mode
      });
      setIsViewOnce(false);
      // Garante scroll até a própria mensagem recém-enviada
      scrollToBottom(true);
      setShowScrollBottomButton(false);
      setUnreadBelowCount(0);
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      showToast(err.message || "Falha ao enviar mensagem.", "error");
      setInput(textToSend);
    } finally {
      setSending(false);
    }
  };

  // Processamento e envio de mídias: fotos (comprimidas), áudios e documentos (RF02, RF07, RN04)
  const processAndUploadFile = async (file) => {
    if (!file || isUserMuted || userRole === 'view') {
      if (isUserMuted || userRole === 'view') {
        showToast("Você não possui permissão para enviar arquivos nesta sala.", "warning");
      }
      return;
    }

    try {
      let fileToSend = file;
      if (file.type.startsWith('image/')) {
        setIsCompressing(true);
        setCompressionProgress(20);

        const compInterval = setInterval(() => {
          setCompressionProgress((p) => Math.min(p + 20, 85));
        }, 120);

        fileToSend = await compressImage(file);
        clearInterval(compInterval);
        setCompressionProgress(92);
      }

      setUploading(true);
      const { url } = await uploadImage(fileToSend);
      setCompressionProgress(100);

      const replyId = replyingTo ? replyingTo.id : null;
      const targetRoomId = roomId || activeRoom?.id || user?.sala_id;
      if (!targetRoomId) {
        showToast("Selecione uma sala para enviar arquivos.", "warning");
        return;
      }

      await sendRoomMessage(targetRoomId, url, replyId, {
        ttl_seconds: ttlSeconds,
        is_view_once: isViewOnce,
        is_secret_mode: activeRoom?.is_secret_mode
      });
      setIsViewOnce(false);
      setReplyingTo(null);
      scrollToBottom(true);
      const label = file.type.startsWith('image/')
        ? "Imagem enviada com sucesso!"
        : file.type.startsWith('audio/')
        ? "Áudio enviado com sucesso!"
        : "Documento PDF enviado com sucesso!";
      showToast(label, "success");
    } catch (err) {
      console.error("Erro no upload de arquivo:", err);
      showToast(err.message || "Erro ao processar arquivo.", "error");
    } finally {
      setIsCompressing(false);
      setUploading(false);
      setCompressionProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processAndUploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (isUserMuted || userRole === 'view') return;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isUserMuted || userRole === 'view') return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (
      file.type.startsWith('image/') ||
      file.type.startsWith('audio/') ||
      file.type === 'application/pdf' ||
      file.name.endsWith('.pdf')
    ) {
      processAndUploadFile(file);
    } else {
      showToast("Formato não suportado. Envie imagens, áudios ou documentos PDF.", "warning");
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
    showToast("Mensagem copiada para a área de transferência!", "success");
  };

  const handleMuteAction = async (targetUserId, shouldMute) => {
    if (!roomId) return;
    try {
      await muteMember(roomId, targetUserId, shouldMute);
      setMembers((prev) =>
        prev.map((m) =>
          (m.usuario_id === targetUserId || m.id === targetUserId)
            ? { ...m, is_muted: shouldMute }
            : m
        )
      );
      if (targetUserId === user?.id) {
        setIsUserMuted(shouldMute);
      }
      showToast(shouldMute ? "Membro silenciado." : "Membro desmutado.", "info");
    } catch (err) {
      showToast(err.message || "Erro ao atualizar mute.", "error");
    }
  };

  const handleBanAction = async (targetUserId) => {
    if (!roomId) return;
    if (!window.confirm("Deseja realmente banir/remover este membro da sala?")) return;
    try {
      await banMember(roomId, targetUserId);
      setMembers((prev) =>
        prev.filter((m) => m.usuario_id !== targetUserId && m.id !== targetUserId)
      );
      showToast("Membro removido da sala com sucesso.", "success");
    } catch (err) {
      showToast(err.message || "Erro ao banir membro.", "error");
    }
  };

  const handleRoleAction = async (targetUserId, newRole) => {
    if (!roomId) return;
    try {
      await updateMemberRole(roomId, targetUserId, newRole);
      setMembers((prev) =>
        prev.map((m) =>
          (m.usuario_id === targetUserId || m.id === targetUserId)
            ? { ...m, role: newRole }
            : m
        )
      );
      if (targetUserId === user?.id && !user?.is_site_admin) {
        setUserRole(newRole);
      }
      showToast(`Cargo atualizado para ${newRole.toUpperCase()}.`, "success");
    } catch (err) {
      showToast(err.message || "Erro ao alterar cargo do membro.", "error");
    }
  };

  const isCanModerate = userRole === 'admin' || userRole === 'mod' || user?.is_site_admin;
  const isInputDisabled = isUserMuted || userRole === 'view' || sending;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col h-[88vh] w-full max-w-5xl mx-auto bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header do Chat */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
              title="Abrir lista de canais"
            >
              ☰
            </button>
          )}

          {/* Badge SSE Connection State em Tempo Real */}
          <div className="flex items-center">
            {sseStatus === 'connected' && (
              <div
                title="Conexão em tempo real estabelecida via SSE"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">Conectado</span>
              </div>
            )}
            {(sseStatus === 'reconnecting' || sseStatus === 'connecting') && (
              <div
                title="Tentando restabelecer fluxo SSE com o servidor..."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="hidden sm:inline">Reconectando...</span>
              </div>
            )}
            {sseStatus === 'disconnected' && (
              <div
                title="Servidor indisponível ou conexão encerrada"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="hidden sm:inline">Servidor Indisponível</span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">#{roomTitle}</h2>
              {activeRoom?.tipo_sala === 'temporaria' && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Efêmera (TTL)
                </span>
              )}
              {activeRoom?.is_secret_mode && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-1">
                  🔒 MODO SECRETO
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
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            className="text-xs font-semibold min-h-[44px] py-1.5 px-3 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Central de Segurança & Privacidade (Sessões e LGPD)"
          >
            <span>🛡️</span>
            <span className="hidden sm:inline">Segurança</span>
          </button>

          {isCanModerate && (
            <button
              onClick={() => {
                setIsModDrawerOpen(true);
                loadRoomMembers();
              }}
              className="text-xs font-semibold min-h-[44px] py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Moderação</span>
            </button>
          )}

          <Button variant="secondary" onClick={onLogout} className="text-xs min-h-[44px] py-1.5 px-3">
            Sair
          </Button>
        </div>
      </div>

      {/* Lista de Mensagens */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="relative flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar will-change-scroll [transform:translateZ(0)]"
      >
        {/* Indicador de carregamento superior / Início do Histórico */}
        {loadingMore && (
          <div className="flex items-center justify-center py-2 text-xs text-emerald-400 gap-2 select-none animate-pulse">
            <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Carregando mensagens anteriores...</span>
          </div>
        )}
        {!hasMore && messages.length >= 100 && (
          <div className="flex items-center justify-center py-3 text-[11px] text-zinc-500 gap-2 select-none">
            <span className="w-8 h-px bg-zinc-800"></span>
            <span>Início do histórico de mensagens</span>
            <span className="w-8 h-px bg-zinc-800"></span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs py-12">
            <span className="text-3xl mb-2">💬</span>
            <p>Nenhuma mensagem ainda neste canal.</p>
            <p className="text-zinc-600">Seja o primeiro a iniciar a conversa!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const isSameDayMsg = prevMsg ? isSameDay(prevMsg.created_at, msg.created_at) : false;
            const showDateDivider = !isSameDayMsg;
            const isSameAuthor = prevMsg && prevMsg.autor_nickname === msg.autor_nickname;
            const prevTime = prevMsg ? parseUtcDate(prevMsg.created_at)?.getTime() : null;
            const currTime = parseUtcDate(msg.created_at)?.getTime();
            const timeDiff = prevTime && currTime ? (currTime - prevTime) / (1000 * 60) : 999;
            const isConsecutive = isSameAuthor && isSameDayMsg && timeDiff < 3 && !msg.reply_to_id;
            const isMe = msg.autor_nickname === user?.nickname;
            const isImage = isImageUrl(msg.conteudo.trim());
            const isAudio = isAudioUrl(msg.conteudo.trim());
            const isPdf = isPdfUrl(msg.conteudo.trim());
            const mensagemOriginal = msg.reply_to_id
              ? messages.find((m) => m.id === msg.reply_to_id)
              : null;
            const isMenuActive = activeMenuId === msg.id;

            return (
              <React.Fragment key={msg.id}>
                {/* Separador de Dia de Envio */}
                {showDateDivider && (
                  <div className="flex items-center justify-center my-3.5 select-none">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/90 border border-zinc-700/60 shadow-xs backdrop-blur-xs">
                      <span className="text-[10px]">📅</span>
                      <span className="text-[11px] font-medium text-zinc-300 tracking-wide">
                        {formatDateDivider(msg.created_at)}
                      </span>
                    </div>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={`flex flex-col group relative ${
                    isMenuActive
                      ? 'z-50'
                      : 'z-0 message-item-contain [content-visibility:auto] [contain-intrinsic-size:0_54px]'
                  } ${
                    isMe ? 'items-end' : 'items-start'
                  } ${isConsecutive ? 'mt-1' : 'mt-4 first:mt-0'}`}
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
                    <span className="text-[10px] text-zinc-500" title={formatMessageDateTime(msg.created_at)}>
                      • {formatMessageTime(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Linha do Balão com Botão de Ações (...) */}
                <div
                  className={`relative flex items-center gap-1.5 group/msg max-w-[85%] sm:max-w-[75%] overflow-visible ${
                    isMe ? 'flex-row-reverse' : 'flex-row'
                  } ${isMenuActive ? 'z-50' : 'z-10'}`}
                >
                  {/* Balão da Mensagem */}
                  <div
                    className={`rounded-2xl p-3.5 text-sm relative shadow-md overflow-hidden transition-all duration-700 gpu-layer max-w-full ${
                      highlightedMessageId === msg.id
                        ? 'ring-2 ring-emerald-400 bg-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.35)]'
                        : isMe
                        ? 'bg-emerald-600 text-white rounded-br-xs'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-xs border border-zinc-700/60'
                    }`}
                  >
                    {/* Citação / Resposta */}
                    {msg.reply_to_id && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScrollToMessage(msg.reply_to_id);
                        }}
                        className="mb-2 p-2 rounded bg-black/25 border-l-2 border-emerald-400 text-xs text-zinc-300 cursor-pointer hover:bg-black/40 hover:border-emerald-300 transition-colors select-none"
                        title="Ir para a mensagem original"
                      >
                        <span className="font-semibold block text-emerald-300">
                          {mensagemOriginal ? mensagemOriginal.autor_nickname : 'Mensagem'}
                        </span>
                        <p className="truncate line-clamp-1">
                          {mensagemOriginal ? mensagemOriginal.conteudo : 'Ver mensagem original...'}
                        </p>
                      </div>
                    )}

                    {msg.is_view_once ? (
                      <div
                        onClick={() => setActiveViewOnceId(msg.id)}
                        className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-emerald-500/40 hover:border-emerald-400 cursor-pointer transition-all shadow-md group select-none"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
                          📷
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                            <span>Foto de Visualização Única</span>
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-mono">1x</span>
                          </div>
                          <div className="text-[11px] text-zinc-400">Toque para abrir (se autodestrói ao fechar)</div>
                        </div>
                      </div>
                    ) : isImage ? (
                      <img
                        src={msg.conteudo.trim()}
                        alt="Anexo de mídia"
                        className="rounded-lg max-h-80 w-auto object-cover hover:opacity-95 cursor-zoom-in"
                        onClick={() => setImagemAmpliada(msg.conteudo.trim())}
                      />
                    ) : isAudio ? (
                      <div className="my-1.5 p-2.5 rounded-xl bg-black/40 border border-zinc-700/60 max-w-sm">
                        <div className="flex items-center gap-2 mb-1.5 text-xs text-emerald-400 font-mono font-bold">
                          <span>🎵</span>
                          <span>Áudio da Conversa</span>
                        </div>
                        <audio controls src={msg.conteudo.trim()} className="w-full h-8" />
                      </div>
                    ) : isPdf ? (
                      <a
                        href={msg.conteudo.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-emerald-500/30 hover:border-emerald-400 transition-colors my-1.5 max-w-sm group select-none"
                      >
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl font-bold">
                          📄
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-200 truncate group-hover:text-emerald-300">
                            {msg.conteudo.trim().split('/').pop() || 'Documento.pdf'}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">Documento PDF • Toque para visualizar</div>
                        </div>
                        <span className="text-zinc-400 group-hover:text-emerald-300 text-sm">↗</span>
                      </a>
                    ) : (
                      <div className="text-sm break-words whitespace-pre-wrap max-w-full overflow-hidden">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                          components={{
                            pre: ({ node, ...props }) => (
                              <div className="w-full my-1 rounded-xl bg-black/60 border border-black/40 overflow-hidden max-w-full">
                                <pre className="p-3 text-xs leading-relaxed font-mono overflow-x-auto text-zinc-200 custom-scrollbar" {...props} />
                              </div>
                            ),
                            code: ({ node, inline, ...props }) =>
                              inline ? (
                                <code className="px-1.5 py-0.5 rounded bg-black/40 text-emerald-200 font-mono text-xs" {...props} />
                              ) : (
                                <code {...props} />
                              ),
                            img: ({ node, ...props }) => (
                              <img
                                {...props}
                                className="max-w-sm rounded-lg my-2 shadow-md cursor-zoom-in hover:opacity-90 transition-opacity"
                                loading="lazy"
                                onClick={() => setImagemAmpliada(props.src)}
                              />
                            ),
                            p: ({ node, children, ...props }) => (
                              <p className="mb-1 last:mb-0 leading-relaxed" {...props}>
                                {renderWithMentions(children)}
                              </p>
                            ),
                            li: ({ node, children, ...props }) => (
                              <li {...props}>
                                {renderWithMentions(children)}
                              </li>
                            ),
                            a: ({ node, ...props }) => (
                              <a
                                className="text-emerald-300 hover:underline font-medium"
                                target="_blank"
                                rel="noopener noreferrer"
                                {...props}
                              />
                            ),
                          }}
                        >
                          {msg.conteudo}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* Metadados: Ticks de Leitura e Contagem Regressiva de TTL */}
                    <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                      {msg.ttl_seconds && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono flex items-center gap-1">
                          <span>⏱️</span>
                          <span>
                            {msg.expires_at
                              ? `${Math.max(0, Math.ceil(((parseUtcDate(msg.expires_at)?.getTime() || 0) - Date.now()) / 1000))}s`
                              : `${msg.ttl_seconds}s`}
                          </span>
                        </span>
                      )}

                      {isMe && (
                        <span
                          className="text-[11px] font-mono select-none"
                          title={
                            msg.status_recibo === 'read'
                              ? 'Lido (✓✓)'
                              : msg.status_recibo === 'delivered'
                              ? 'Entregue (✓✓)'
                              : 'Enviado (✓)'
                          }
                        >
                          {msg.status_recibo === 'read' ? (
                            <span className="text-emerald-300 font-bold">✓✓</span>
                          ) : msg.status_recibo === 'delivered' ? (
                            <span className="text-zinc-400 font-bold">✓✓</span>
                          ) : (
                            <span className="text-zinc-500">✓</span>
                          )}
                        </span>
                      )}
                    </div>

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
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border active:scale-90 transition-transform duration-75 cursor-pointer gpu-layer ${
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
                  <div className="relative flex items-center overflow-visible">
                    <button
                      onClick={(e) => handleToggleMenu(e, msg.id)}
                      className="opacity-0 max-sm:opacity-80 group-hover/msg:opacity-100 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 active:scale-95 transition-all duration-120 cursor-pointer gpu-layer"
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
                        className={`absolute z-50 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 min-w-[170px] animate-in fade-in zoom-in-95 duration-120 gpu-layer will-change-transform ${
                          isMe ? 'right-0' : 'left-0'
                        } ${
                          menuPlacement === 'up'
                            ? 'bottom-full mb-2'
                            : 'top-full mt-2'
                        }`}
                      >
                        {/* Emojis Rápidos (touch targets >= 44x44px em mobile) */}
                        <div className="flex items-center justify-between gap-1 px-1 py-1 mb-1">
                          {EMOJIS_DISPONIVEIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleReaction(msg.id, emoji);
                                setActiveMenuId(null);
                              }}
                              className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] text-lg sm:text-base hover:scale-125 active:scale-90 transition-transform duration-75 cursor-pointer p-1"
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
                            className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-[34px] text-xs text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer text-left"
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
                          className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-[34px] text-xs text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <span>📋</span>
                          <span>Copiar mensagem</span>
                        </button>

                        {/* Opção Denunciar Mensagem (RF06) */}
                        <button
                          onClick={async () => {
                            const motivo = prompt('Informe o motivo da denúncia:');
                            if (motivo && motivo.trim()) {
                              try {
                                const res = await submitReport({
                                  mensagem_id: msg.id,
                                  sala_id: roomId,
                                  motivo: motivo.trim()
                                });
                                showToast(res.message, 'info');
                              } catch (e) {
                                showToast(e.message || 'Erro ao denunciar', 'error');
                              }
                            }
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-[34px] text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <span>⚠️</span>
                          <span>Denunciar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })
        )}

        {/* Botão Flutuante de Auto-Scroll Inteligente */}
        {showScrollBottomButton && (
          <div className="sticky bottom-3 left-0 right-0 flex justify-center pointer-events-none z-30">
            <button
              type="button"
              onClick={() => {
                scrollToBottom(true);
                setShowScrollBottomButton(false);
                setUnreadBelowCount(0);
              }}
              className="pointer-events-auto px-4 py-2 min-h-[44px] rounded-full bg-zinc-900/95 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-semibold shadow-2xl backdrop-blur-md hover:bg-emerald-500 hover:text-black transition-all flex items-center gap-2 cursor-pointer animate-bounce"
            >
              <span>↓ Novas mensagens abaixo</span>
              {unreadBelowCount > 0 && (
                <span className="px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-bold rounded-full">
                  {unreadBelowCount}
                </span>
              )}
            </button>
          </div>
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
      <div className="flex flex-col border-t border-zinc-800 bg-zinc-950">
        {/* Barra de Progresso durante Compressão / Upload */}
        {(isCompressing || uploading) && (
          <div className="w-full px-4 py-2 bg-zinc-900/95 border-b border-emerald-500/20 text-xs font-mono space-y-1">
            <div className="flex items-center justify-between text-[11px] text-emerald-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                {isCompressing ? 'Otimizando e comprimindo imagem...' : 'Enviando imagem ao storage...'}
              </span>
              <span>{compressionProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200"
                style={{ width: `${compressionProgress}%` }}
              />
            </div>
          </div>
        )}

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

        {/* Indicador Visual Efêmero de Usuários Digitando (Typing Indicator) */}
        {Object.keys(typingUsers).length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-emerald-400 font-medium bg-zinc-950/95 border-b border-zinc-800/80 animate-fade-in">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
            </span>
            <span>
              {Object.keys(typingUsers).length === 1
                ? `${Object.keys(typingUsers)[0]} está digitando...`
                : `${Object.keys(typingUsers).join(', ')} estão digitando...`}
            </span>
          </div>
        )}

        <form onSubmit={handleSend} className="p-3.5 flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,audio/*,.pdf"
            className="hidden"
            disabled={isInputDisabled}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled || uploading}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={isInputDisabled ? "Envio desativado para seu cargo" : "Anexar Arquivo (Imagens, Áudios ou PDFs)"}
          >
            {uploading ? '⏳' : '📎'}
          </button>

          {/* Botão de Foto de Visualização Única (RF07) */}
          <button
            type="button"
            onClick={() => setIsViewOnce((prev) => !prev)}
            disabled={isInputDisabled}
            className={`min-h-[44px] min-w-[40px] flex items-center justify-center p-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
              isViewOnce
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
            }`}
            title={isViewOnce ? "Visualização única ATIVA: a mídia será destruída após aberta (RF07)" : "Ativar envio de visualização única (RF07)"}
          >
            1️⃣
          </button>

          {/* Seletor de Temporizador de Autodestruição pós-leitura (RF04) */}
          <select
            value={ttlSeconds === null ? '' : ttlSeconds}
            onChange={(e) => setTtlSeconds(e.target.value ? Number(e.target.value) : null)}
            disabled={isInputDisabled}
            className={`min-h-[44px] px-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
              ttlSeconds
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700/60'
            }`}
            title="Temporizador de autodestruição pós-leitura (RF04)"
          >
            <option value="">⏱️ Sem TTL</option>
            <option value="5">⏱️ 5s</option>
            <option value="30">⏱️ 30s</option>
            <option value="60">⏱️ 1m</option>
            <option value="300">⏱️ 5m</option>
            <option value="3600">⏱️ 1h</option>
            <option value="86400">⏱️ 24h</option>
          </select>

          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}

            disabled={isInputDisabled}
            placeholder={
              isUserMuted
                ? "Você está silenciado nesta sala."
                : userRole === 'view'
                ? "Modo apenas visualização (View)."
                : replyingTo
                ? "Digite sua resposta..."
                : "Digite sua mensagem... (Arraste fotos, áudios ou PDFs)"
            }
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none min-h-[44px] max-h-28 overflow-y-auto disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm"
            rows="1"
          />

          <Button
            type="submit"
            disabled={isInputDisabled || !input.trim()}
            className="min-h-[44px] min-w-[70px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? '...' : 'Enviar'}
          </Button>
        </form>
      </div>

      {/* Overlay de Drag-and-Drop de Mídias */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-sm border-2 border-dashed border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-3xl text-emerald-400 border border-emerald-500/40 animate-pulse">
            📎
          </div>
          <p className="text-emerald-300 font-mono text-sm font-bold">Solte o arquivo para enviar</p>
          <p className="text-zinc-400 font-mono text-xs">Suporta fotos com compressão, áudios e documentos PDF</p>
        </div>
      )}

      {/* Drawer de Moderação */}
      <ModerationDrawer
        isOpen={isModDrawerOpen}
        onClose={() => setIsModDrawerOpen(false)}
        activeRoom={activeRoom}
        members={members}
        currentUserRole={userRole}
        currentUserId={user?.id}
        onMuteMember={handleMuteAction}
        onBanMember={handleBanAction}
        onRoleChange={handleRoleAction}
      />

      {/* Lightbox / Imagem Ampliada */}
      {imagemAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 cursor-zoom-out gpu-layer"
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

      {/* Container de Toasts Modernos */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md font-mono text-xs flex items-start gap-2.5 animate-in slide-in-from-top-2 fade-in duration-200 ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
                : 'bg-zinc-900/90 border-zinc-700/60 text-zinc-200'
            }`}
          >
            <span className="text-sm">
              {toast.type === 'error' && '❌'}
              {toast.type === 'success' && '✅'}
              {toast.type === 'warning' && '⚠️'}
              {toast.type === 'info' && 'ℹ️'}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-zinc-400 hover:text-zinc-100 p-0.5 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Modal de Mídia de Visualização Única (RF07) */}
      {activeViewOnceId && (
        <ViewOnceModal
          messageId={activeViewOnceId}
          onClose={() => setActiveViewOnceId(null)}
        />
      )}

      {/* Central de Segurança e Privacidade (RF01, RF06, RN06) */}
      <SecuritySettingsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onAccountDeleted={onLogout}
      />
    </div>
  );
}