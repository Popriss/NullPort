import imageCompression from 'browser-image-compression';

/**
 * Comprime imagens no client-side para menos de 1MB antes de enviar ao servidor
 */
export async function compressImage(file) {
  const options = {
    maxSizeMB: 0.95, // Menos de 1 MB
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error("Erro na compressão da imagem:", error);
    return file; // Retorna original em caso de falha silenciosa
  }
}
