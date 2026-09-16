/**
 * Verifica se uma string ou URL termina com extensão de imagem comum
 */
export const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi;

export function isImageUrl(url) {
  return /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url);
}

/**
 * Divide o texto identificando URLs de imagens para renderização visual
 */
export function extractImageUrls(text) {
  const matches = text.match(IMAGE_URL_REGEX);
  return matches || [];
}
