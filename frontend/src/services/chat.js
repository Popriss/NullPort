const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('nullport_token');
}

// --- Gestão de Salas e Árvore ---

export async function fetchRooms() {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar salas");
  return response.json();
}

export async function fetchMyRooms() {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/chat/my-rooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Erro ao buscar salas.');
  return res.json();
}

export async function createRoom(roomData) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(roomData)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar sala");
  }
  return response.json();
}

export async function fetchSubrooms(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/subrooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar sub-canais");
  return response.json();
}

export async function createSubroom(roomId, data) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/subrooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar sub-canal");
  }
  return response.json();
}

export async function joinRoom(roomId, senha = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ senha: senha || null })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao ingressar na sala");
  }
  return response.json();
}

export async function joinRoomByUrl(nomeUrl, senha = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/join-by-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ nome_url: nomeUrl, senha: senha || null })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao acessar a sala");
  }
  return response.json();
}

// --- Moderação & Membros ---

export async function fetchRoomMembers(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao buscar membros da sala");
  }
  return response.json();
}

export async function updateMemberRole(roomId, userId, role) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members/${userId}/role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ role })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao atualizar cargo do membro");
  }
  return response.json();
}

export async function muteMember(roomId, userId, isMuted) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members/${userId}/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ is_muted: isMuted })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao alterar mute do membro");
  }
  return response.json();
}

export async function banMember(roomId, userId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members/${userId}/ban`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao remover membro");
  }
  return response.json();
}

// --- Mensagens por Sala ---

export async function fetchRoomMessages(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao carregar mensagens da sala");
  }
  return response.json();
}

export async function sendRoomMessage(roomId, conteudo, replyToId = null, extra = {}) {
  const token = getToken();
  const body = {
    conteudo,
    reply_to_id: replyToId,
    is_secret_mode: Boolean(extra.is_secret_mode),
    ttl_seconds: extra.ttl_seconds || null,
    is_view_once: Boolean(extra.is_view_once),
    is_e2ee: Boolean(extra.is_e2ee),
    e2ee_envelope: extra.e2ee_envelope || null
  };
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao enviar mensagem");
  }
  return response.json();
}

// --- Compatibilidade Legada ---

export async function fetchMessages() {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar mensagens");
  return response.json();
}

export async function sendMessage(conteudo, replyToId = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conteudo, reply_to_id: replyToId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao enviar mensagem");
  }
  return response.json();
}

export async function uploadImage(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/chat/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro no upload da imagem");
  }
  return response.json();
}

export async function reactToMessage(messageId, emoji) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/react`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ emoji })
  });
  if (!response.ok) throw new Error("Erro ao reagir à mensagem");
  return response.json();
}

export function subscribeToMessages(onMessageCallback, roomId = null, onStatusChange = null) {
  const token = getToken();
  const url = roomId 
    ? `${API_URL}/api/chat/stream?token=${token}&room_id=${roomId}`
    : `${API_URL}/api/chat/stream?token=${token}`;

  if (onStatusChange) onStatusChange('connecting');

  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    if (onStatusChange) onStatusChange('connected');
  };

  eventSource.onmessage = (event) => {
    if (event.data === ": keep-alive") return;
    try {
      const data = JSON.parse(event.data);
      onMessageCallback(data);
    } catch (err) {
      console.error("Erro ao parsear evento do SSE:", err);
    }
  };

  eventSource.onerror = (err) => {
    console.error("Erro na conexão SSE:", err);
    if (onStatusChange) {
      if (eventSource.readyState === EventSource.CONNECTING) {
        onStatusChange('reconnecting');
      } else {
        onStatusChange('disconnected');
      }
    }
  };

  return () => {
    eventSource.close();
    if (onStatusChange) onStatusChange('disconnected');
  };
}

export async function reportMessage(messageId, roomId, motivo) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mensagem_id: messageId, sala_id: roomId, motivo })
  });
  if (!response.ok) throw new Error("Erro ao registrar denúncia");
  return response.json();
}

// --- Recursos V3 (Digitação, Webhooks, Auditoria e Exportação Criptografada) ---

export async function sendTyping(roomId, isTyping = true) {
  const token = getToken();
  if (!roomId || !token) return;
  try {
    await fetch(`${API_URL}/api/chat/rooms/${roomId}/typing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_typing: isTyping })
    });
  } catch (err) {
    // Evento efêmero: falhas silenciosas são aceitáveis
    console.debug("Erro ao enviar indicador de digitação:", err);
  }
}

export async function fetchWebhooks(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/webhooks`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao carregar webhooks da sala");
  }
  return response.json();
}

export async function generateWebhook(roomId, nome = "Webhook Externo") {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ nome })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao gerar webhook para a sala");
  }
  return response.json();
}

export async function deleteWebhook(roomId, webhookId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/webhooks/${webhookId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao remover webhook");
  }
  return response.json();
}

export async function fetchAuditLogs(salaId = null, action = null, limit = 100) {
  const token = getToken();
  const params = new URLSearchParams();
  if (salaId) params.append('sala_id', salaId);
  if (action) params.append('action', action);
  if (limit) params.append('limit', limit);

  const response = await fetch(`${API_URL}/api/admin/audit-logs?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao carregar trilha de auditoria");
  }
  return response.json();
}

export async function exportRoomHistory(roomId, format = 'json', password) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ format, password })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao exportar histórico criptografado");
  }
  return response.blob();
}

// --- RF06: Bloqueio de Usuários ---

export async function blockUser(userId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/users/${userId}/block`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao bloquear usuário");
  }
  return response.json();
}

export async function unblockUser(userId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/users/${userId}/block`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao desbloquear usuário");
  }
  return response.json();
}

export async function fetchBlockedUsers() {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/users/blocked`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao listar usuários bloqueados");
  }
  return response.json();
}

// --- RF05 & RF04: Confirmação de Leitura e TTL ---

export async function markMessageRead(messageId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

export async function markMessageDelivered(messageId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/delivered`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

// --- RF07: Mídia de Visualização Única (View-Once) ---

export async function openViewOnceMedia(messageId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/view-once/open`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao abrir mídia de visualização única");
  }
  return response.json();
}

export async function closeViewOnceMedia(messageId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/view-once/close`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

// --- RF06: Denúncia com Snapshot Contextual ---

export async function submitReport({ mensagem_id, sala_id, motivo }) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mensagem_id, sala_id, motivo })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao registrar denúncia");
  }
  return response.json();
}
