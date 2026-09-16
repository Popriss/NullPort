import { request } from './api';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchMessages() {
  return request('/api/chat/messages');
}

export async function sendMessage(conteudo) {
  return request('/api/chat/messages', {
    method: 'POST',
    body: JSON.stringify({ conteudo }),
  });
}

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/chat/upload', {
    method: 'POST',
    body: formData,
  });
}

export function subscribeToMessages(onMessage, onError) {
  const token = localStorage.getItem('nullport_token');
  if (!token) return null;

  const eventSource = new EventSource(`${BASE_URL}/api/chat/stream?token=${encodeURIComponent(token)}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (err) {
      console.error("Erro ao processar mensagem SSE:", err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}
