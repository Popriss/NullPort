// NullPort E2EE — End-to-End Encryption Module (RN01)
// Criptografia Ponta a Ponta baseada na Web Crypto API (SubtleCrypto)
// ECDH (P-256) para acordo de chaves e AES-GCM (256-bit) para cifragem simétrica de mensagens.

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

const STORAGE_PRIVATE_KEY = 'nullport_e2ee_private_key';
const STORAGE_PUBLIC_KEY = 'nullport_e2ee_public_key';

/**
 * Inicializa ou carrega o par de chaves E2EE do usuário no navegador.
 */
export async function getOrCreateE2EEKeyPair() {
  if (!window.crypto || !window.crypto.subtle) {
    console.warn('[E2EE] Web Crypto API não disponível neste ambiente.');
    return null;
  }

  const storedPriv = localStorage.getItem(STORAGE_PRIVATE_KEY);
  const storedPub = localStorage.getItem(STORAGE_PUBLIC_KEY);

  if (storedPriv && storedPub) {
    try {
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        JSON.parse(storedPriv),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      );
      return { privateKey, publicKeyBase64: storedPub };
    } catch (e) {
      console.error('[E2EE] Falha ao recuperar chave salva, gerando novo par:', e);
    }
  }

  // Gera novo par ECDH P-256
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const exportedPriv = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const exportedPubSPKI = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pubBase64 = arrayBufferToBase64(exportedPubSPKI);

  localStorage.setItem(STORAGE_PRIVATE_KEY, JSON.stringify(exportedPriv));
  localStorage.setItem(STORAGE_PUBLIC_KEY, pubBase64);

  return { privateKey: keyPair.privateKey, publicKeyBase64: pubBase64 };
}

/**
 * Deriva chave simétrica AES-GCM compartilhada a partir de chave pública remota (SPKI base64).
 */
export async function deriveSharedKey(privateKey, recipientPublicKeyBase64) {
  const pubBuffer = base64ToArrayBuffer(recipientPublicKeyBase64);
  const recipientPublicKey = await window.crypto.subtle.importKey(
    'spki',
    pubBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  return await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra mensagem usando AES-GCM (RN01).
 * O envelope retornado é enviado ao servidor sem que ele consiga decifrar o conteúdo.
 */
export async function encryptE2EEMessage(plaintext, sharedKey) {
  const enc = new TextEncoder();
  const encodedData = enc.encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    sharedKey,
    encodedData
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv)
  };
}

/**
 * Decifra mensagem recebida usando AES-GCM (RN01).
 */
export async function decryptE2EEMessage(envelope, sharedKey) {
  try {
    const ciphertext = base64ToArrayBuffer(envelope.ciphertext);
    const iv = base64ToArrayBuffer(envelope.iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      sharedKey,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (e) {
    console.error('[E2EE] Erro ao decifrar mensagem:', e);
    return '🔒 [Mensagem Cifrada — Chave Incompatível]';
  }
}
