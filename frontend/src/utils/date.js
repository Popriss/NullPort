/**
 * Utilitários robustos para tratamento e exibição de fusos horários (UTC -> Local).
 * Garante que timestamps vindos do backend sem indicador 'Z' sejam tratados em UTC
 * e convertidos para o fuso horário local do navegador do usuário (ex: Horário de Brasília UTC-3).
 */

export function parseUtcDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  let s = String(dateInput).trim();
  if (!s) return null;
  // Se for timestamp puramente numérico (ms)
  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s));
    return isNaN(d.getTime()) ? null : d;
  }
  // Se não contiver 'Z' nem offset de timezone (+HH:MM ou -HH:MM)
  if (!s.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatMessageTime(dateInput) {
  const d = parseUtcDate(dateInput);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatMessageDateTime(dateInput) {
  const d = parseUtcDate(dateInput);
  if (!d) return '';
  return d.toLocaleString('pt-BR');
}

export function formatMessageDate(dateInput) {
  const d = parseUtcDate(dateInput);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Compara se duas datas pertencem ao mesmo dia civil no fuso horário local.
 */
export function isSameDay(d1, d2) {
  const date1 = parseUtcDate(d1);
  const date2 = parseUtcDate(d2);
  if (!date1 || !date2) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Formata a data para divisores de dia no chat:
 * - "Hoje" para mensagens do dia atual
 * - "Ontem" para mensagens do dia anterior
 * - "21 de setembro" para mensagens do ano corrente
 * - "21 de setembro de 2025" para mensagens de anos anteriores
 */
export function formatDateDivider(dateInput) {
  const d = parseUtcDate(dateInput);
  if (!d) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffTime = today.getTime() - target.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Hoje';
  }
  if (diffDays === 1) {
    return 'Ontem';
  }

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long'
    });
  }

  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

