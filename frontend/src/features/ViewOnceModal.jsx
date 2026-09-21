import React, { useEffect, useState } from 'react';
import { openViewOnceMedia, closeViewOnceMedia } from '../services/chat';

export default function ViewOnceModal({ messageId, onClose }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadMedia() {
      try {
        setLoading(true);
        const data = await openViewOnceMedia(messageId);
        if (isMounted) {
          setMediaUrl(data.conteudo);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Falha ao abrir mídia de visualização única.');
          setLoading(false);
        }
      }
    }

    loadMedia();

    return () => {
      isMounted = false;
    };
  }, [messageId]);

  const handleCloseAndDestroy = async () => {
    try {
      await closeViewOnceMedia(messageId);
    } catch (e) {
      console.error('Erro ao destruir mídia:', e);
    } finally {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(5, 8, 18, 0.96)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Barra Superior */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(15, 23, 42, 0.6)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📷</span>
          <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
            Visualização Única (Retenção Zero)
          </span>
          <span
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 600
            }}
          >
            Destruição ao fechar
          </span>
        </div>

        <button
          onClick={handleCloseAndDestroy}
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
          }}
        >
          ✕ Fechar e Destruir
        </button>
      </div>

      {/* Conteúdo Principal */}
      <div
        style={{
          maxWidth: '90vw',
          maxHeight: '75vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
      >
        {loading && (
          <div style={{ color: '#10b981', fontSize: '15px', fontWeight: 500 }}>
            Descriptografando mídia efêmera...
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '20px 28px',
              borderRadius: '12px',
              textAlign: 'center',
              maxWidth: '420px'
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
              Mídia Indisponível
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>{error}</div>
            <button
              onClick={onClose}
              style={{
                marginTop: '16px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Voltar ao chat
            </button>
          </div>
        )}

        {mediaUrl && !loading && !error && (
          <div style={{ position: 'relative' }}>
            <img
              src={mediaUrl}
              alt="Mídia de visualização única"
              style={{
                maxWidth: '85vw',
                maxHeight: '70vh',
                borderRadius: '12px',
                objectFit: 'contain',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)',
                pointerEvents: 'none'
              }}
              draggable={false}
            />
            {/* Marca d'água de proteção */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#94a3b8',
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                pointerEvents: 'none'
              }}
            >
              NullPort Zero-Trace Shield
            </div>
          </div>
        )}
      </div>

      {/* Aviso Rodapé */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          color: '#64748b',
          fontSize: '12px',
          textAlign: 'center'
        }}
      >
        Esta imagem será expurgada permanentemente do storage e banco de dados ao fechar.
      </div>
    </div>
  );
}
