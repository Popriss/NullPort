/**
 * Utilitários de Regex e Verificação de Mídia (RF02, RF07)
 */
export const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi;

export function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url.trim());
}

export function isAudioUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(mp3|ogg|wav|weba|m4a)(\?.*)?$/i.test(url.trim());
}

export function isPdfUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(pdf)(\?.*)?$/i.test(url.trim());
}

export function extractImageUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(IMAGE_URL_REGEX);
  return matches || [];
}
