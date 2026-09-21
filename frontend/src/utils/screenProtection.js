// NullPort Screen Defense & Anti-Capture Guard (RN02)
// Camada defensiva web contra captura de tela, espelhamento passivo e vazamento visual.

let blurOverlay = null;
let toastElement = null;

function createBlurOverlay() {
  if (blurOverlay) return;
  blurOverlay = document.createElement('div');
  blurOverlay.id = 'nullport-screen-shield';
  blurOverlay.style.position = 'fixed';
  blurOverlay.style.inset = '0';
  blurOverlay.style.zIndex = '999999';
  blurOverlay.style.backdropFilter = 'blur(28px) brightness(0.2)';
  blurOverlay.style.backgroundColor = 'rgba(10, 15, 29, 0.85)';
  blurOverlay.style.display = 'none';
  blurOverlay.style.flexDirection = 'column';
  blurOverlay.style.alignItems = 'center';
  blurOverlay.style.justifyContent = 'center';
  blurOverlay.style.color = '#10b981';
  blurOverlay.style.fontFamily = 'monospace, sans-serif';
  blurOverlay.style.pointerEvents = 'none';
  blurOverlay.innerHTML = `
    <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(16, 185, 129, 0.4); padding: 24px 36px; border-radius: 12px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.8);">
      <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
      <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.05em; color: #34d399;">NULLPORT SHIELD ATIVO</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">Conteúdo protegido contra captura passiva.</div>
    </div>
  `;
  document.body.appendChild(blurOverlay);
}

function showScreenshotAlert() {
  if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.style.position = 'fixed';
    toastElement.style.top = '20px';
    toastElement.style.left = '50%';
    toastElement.style.transform = 'translateX(-50%)';
    toastElement.style.zIndex = '1000000';
    toastElement.style.backgroundColor = '#ef4444';
    toastElement.style.color = '#ffffff';
    toastElement.style.padding = '10px 20px';
    toastElement.style.borderRadius = '8px';
    toastElement.style.fontSize = '13px';
    toastElement.style.fontWeight = '600';
    toastElement.style.boxShadow = '0 10px 25px rgba(239, 68, 68, 0.4)';
    toastElement.innerText = '⚠️ Captura de tela restrita nesta conversa (RN02)';
    document.body.appendChild(toastElement);
  } else {
    toastElement.style.display = 'block';
  }

  setTimeout(() => {
    if (toastElement) toastElement.style.display = 'none';
  }, 3500);
}

/**
 * Inicializa os ouvintes de proteção de tela no navegador.
 */
export function initScreenProtection() {
  createBlurOverlay();

  const handleBlur = () => {
    if (blurOverlay) blurOverlay.style.display = 'flex';
  };

  const handleFocus = () => {
    if (blurOverlay) blurOverlay.style.display = 'none';
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (blurOverlay) blurOverlay.style.display = 'flex';
    } else {
      if (blurOverlay) blurOverlay.style.display = 'none';
    }
  };

  const handleKeyDown = (e) => {
    // Intercepta PrintScreen ou Win+Shift+S ou Ctrl+P
    if (
      e.key === 'PrintScreen' ||
      (e.ctrlKey && e.key === 'p') ||
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4'))
    ) {
      showScreenshotAlert();
    }
  };

  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('keyup', handleKeyDown);

  return () => {
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('keyup', handleKeyDown);
    if (blurOverlay && blurOverlay.parentNode) {
      blurOverlay.parentNode.removeChild(blurOverlay);
      blurOverlay = null;
    }
  };
}
