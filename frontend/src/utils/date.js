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
