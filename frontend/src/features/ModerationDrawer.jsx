import React, { useState } from 'react';

export default function ModerationDrawer({
  isOpen,
  onClose,
  activeRoom,
  members = [],
  currentUserRole = 'padrao',
  onMuteMember,
  onBanMember,
}) {
  const [copied, setCopied] = useState(false);
  const isModOrAdmin = currentUserRole === 'admin' || currentUserRole === 'mod';
  const isAdmin = currentUserRole === 'admin';

  if (!isOpen) return null;

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}/#${activeRoom?.nome_url || ''}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-sm bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 gpu-layer will-change-transform">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Moderação da Sala
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {activeRoom?.titulo || activeRoom?.nome_url}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-md text-sm"
            >
              ✕
            </button>
          </div>

          {/* Convite */}
          <div className="mt-4 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
            <span className="text-[11px] text-zinc-400 font-medium block mb-1.5">
              Link de Acesso da Sala
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/#${activeRoom?.nome_url || ''}`}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-xs text-zinc-300 select-all"
              />
              <button
                onClick={handleCopyInvite}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-semibold"
              >
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Lista de Membros */}
          <div className="mt-6">
            <h4 className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider">
              Membros Ativos ({members.length})
            </h4>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {members.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">Nenhum membro listado.</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.usuario_id || member.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs"
                  >
                    <div className="flex flex-col truncate pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-200 truncate">
                          {member.nickname || 'Membro'}
                        </span>
                        {member.is_muted && (
                          <span className="text-[10px] text-rose-400 font-bold" title="Silenciado">
                            🔇
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 capitalize">
                        Cargo: {member.role}
                      </span>
                    </div>

                    {isModOrAdmin && (
                      <div className="flex items-center gap-1">
                        {/* Botão de Mute */}
                        <button
                          onClick={() => onMuteMember(member.usuario_id, !member.is_muted)}
                          title={member.is_muted ? 'Desmutar' : 'Silenciar'}
                          className={`p-1.5 px-2 rounded-md text-[11px] font-medium transition-all ${
                            member.is_muted
                              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          {member.is_muted ? 'Desmutar' : 'Mutar'}
                        </button>

                        {/* Botão de Ban (Apenas Admin) */}
                        {isAdmin && (
                          <button
                            onClick={() => onBanMember(member.usuario_id)}
                            title="Banir/Remover da sala"
                            className="p-1.5 px-2 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                          >
                            Banir
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Rodapé do painel */}
        <div className="pt-4 border-t border-zinc-800 text-center">
          <p className="text-[11px] text-zinc-500">
            Ações de moderação refletem instantaneamente no chat via RBAC.
          </p>
        </div>
      </div>
    </div>
  );
}
