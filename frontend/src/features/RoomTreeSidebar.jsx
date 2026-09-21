import React, { useState } from 'react';
import { joinRoom, joinRoomByUrl } from '../services/chat';

export default function RoomTreeSidebar({
  rooms,
  activeRoom,
  onSelectRoom,
  onCreateRoom,
  onCreateSubroom,
  onJoinRoom,
  user,
  isOpen,
  onClose
}) {
  const [expandedRooms, setExpandedRooms] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalParentId, setModalParentId] = useState(null);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'join'
  
  // Estados para criação
  const [formNomeUrl, setFormNomeUrl] = useState('');
  const [formTitulo, setFormTitulo] = useState('');
  const [formSenha, setFormSenha] = useState('');
  const [formTipo, setFormTipo] = useState('temporaria');
  const [formIsSecretMode, setFormIsSecretMode] = useState(false); // RF03: Modo Secreto
  const [formTtl, setFormTtl] = useState(1440); // 24h em minutos

  // Estados para entrar em sala existente por URL/Senha
  const [joinNomeUrl, setJoinNomeUrl] = useState('');
  const [joinSenha, setJoinSenha] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Estados para modal de sala privada / protegida por senha
  const [passwordModalRoom, setPasswordModalRoom] = useState(null);
  const [roomPassword, setRoomPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);

  const toggleExpand = (roomId, e) => {
    e.stopPropagation();
    setExpandedRooms((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const openCreateDialog = (parentId = null) => {
    setModalParentId(parentId);
    setModalMode('create');
    setFormNomeUrl('');
    setFormTitulo('');
    setFormSenha('');
    setJoinNomeUrl('');
    setJoinSenha('');
    setFormTipo(user?.is_site_admin ? 'permanente' : 'temporaria');
    setFormIsSecretMode(false);
    setError('');
    setShowCreateModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (modalParentId) {
        await onCreateSubroom(modalParentId, {
          nome_url: formNomeUrl.trim().toLowerCase(),
          titulo: formTitulo.trim(),
          senha: formSenha || null
        });
      } else {
        await onCreateRoom({
          nome_url: formNomeUrl.trim().toLowerCase(),
          titulo: formTitulo.trim(),
          senha: formSenha || null,
          tipo_sala: formTipo,
          is_secret_mode: formIsSecretMode,
          ttl_minutes: formTipo === 'temporaria' ? parseInt(formTtl) : null
        });
      }
      setShowCreateModal(false);
    } catch (err) {
      setError(err.message || 'Erro ao criar canal.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExisting = async (e) => {
    e.preventDefault();
    setError('');
    const cleanUrl = joinNomeUrl.trim().toLowerCase().replace(/^#/, '');
    if (!cleanUrl) {
      setError('Informe o identificador da sala.');
      return;
    }

    setLoading(true);
    try {
      const room = await joinRoomByUrl(cleanUrl, joinSenha ? joinSenha.trim() : null);
      if (onJoinRoom) {
        onJoinRoom(room);
      } else {
        onSelectRoom(room);
      }
      setShowCreateModal(false);
    } catch (err) {
      setError(err.message || 'Erro ao acessar a sala. Verifique o identificador e a senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = async (room) => {
    // Se o usuário já for membro da sala ou for site admin:
    if (room.is_membro || user?.is_site_admin) {
      onSelectRoom(room);
      return;
    }

    // Se a sala for privada / tiver senha:
    if (room.tem_senha) {
      setPasswordModalRoom(room);
      setRoomPassword('');
      setPasswordError('');
      return;
    }

    // Se for uma sala pública sem senha mas o usuário ainda não tem vínculo:
    try {
      await joinRoom(room.id);
      room.is_membro = true;
      if (onJoinRoom) {
        onJoinRoom(room);
      } else {
        onSelectRoom({ ...room, is_membro: true });
      }
    } catch (err) {
      console.error("Erro ao entrar na sala pública:", err);
      setPasswordModalRoom(room);
      setRoomPassword('');
      setPasswordError(err.message || 'Erro ao ingressar na sala.');
    }
  };

  const handleJoinWithPassword = async (e) => {
    e.preventDefault();
    if (!passwordModalRoom) return;
    if (!roomPassword.trim()) {
      setPasswordError('Digite a senha da sala.');
      return;
    }

    setJoining(true);
    setPasswordError('');

    try {
      await joinRoom(passwordModalRoom.id, roomPassword.trim());
      const joinedRoom = { ...passwordModalRoom, is_membro: true };
      setPasswordModalRoom(null);
      setRoomPassword('');
      if (onJoinRoom) {
        onJoinRoom(joinedRoom);
      } else {
        onSelectRoom(joinedRoom);
      }
    } catch (err) {
      setPasswordError(err.message || 'Senha incorreta ou erro ao entrar na sala.');
    } finally {
      setJoining(false);
    }
  };

  // Zero-Discovery: usuário comum vê apenas salas das quais é membro
  const visibleRooms = user?.is_site_admin
    ? rooms
    : rooms.filter((r) => r.is_membro);

  // Separa as salas raiz (sem parent_id)
  const rootRooms = visibleRooms.filter((r) => !r.parent_id);

  const renderRoomTree = (room, depth = 0) => {
    const isExpanded = !!expandedRooms[room.id];
    const subrooms = visibleRooms.filter((r) => r.parent_id === room.id);
    const hasChildren = subrooms.length > 0;
    const isActive = activeRoom?.id === room.id;

    return (
      <div key={room.id} className="flex flex-col">
        <div
          onClick={() => handleRoomClick(room)}
          style={{ paddingLeft: `${depth * 14 + 12}px` }}
          className={`group flex items-center justify-between py-2 pr-3 rounded-lg text-xs cursor-pointer transition-all ${
            isActive
              ? 'bg-emerald-500/20 text-emerald-300 font-semibold border-l-2 border-emerald-400'
              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden truncate">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => toggleExpand(room.id, e)}
                className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="text-zinc-600 text-[10px]">#</span>}
            <span className="truncate">{room.titulo || room.nome_url}</span>
            {room.tem_senha && (
              <span className="text-[10px]" title="Sala protegida por senha">🔒</span>
            )}
            {room.tipo_sala === 'temporaria' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                TTL
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              title="Criar sub-canal"
              onClick={(e) => {
                e.stopPropagation();
                openCreateDialog(room.id);
              }}
              className="p-1 hover:bg-zinc-700/80 rounded text-zinc-300 text-[10px]"
            >
              +
            </button>
          </div>
        </div>

        {/* Sub-canais recursivos */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col space-y-0.5">
            {subrooms.map((child) => renderRoomTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop retrátil em telas móveis */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          title="Fechar menu lateral"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950/95 border-r border-zinc-800 p-4 flex flex-col justify-between transition-transform duration-300 backdrop-blur-md md:static md:translate-x-0 gpu-layer will-change-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header da Sidebar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-bold text-sm text-zinc-100">Canais & Salas</span>
            </div>
            <button
              onClick={() => openCreateDialog(null)}
              title="Criar nova sala"
              className="min-h-[44px] sm:min-h-[32px] p-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 transition-all flex items-center justify-center cursor-pointer"
            >
              + Nova
            </button>
          </div>

          {/* Lista de Salas em Árvore */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {rootRooms.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">Nenhuma sala disponível.</p>
            ) : (
              rootRooms.map((room) => renderRoomTree(room, 0))
            )}
          </div>
        </div>

        {/* Informações do usuário logado */}
        {user && (
          <div className="pt-3 mt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <div className="flex flex-col truncate pr-2">
              <span className="font-medium text-zinc-200 truncate">{user.nickname}</span>
              <span className="text-[10px] text-zinc-500 truncate">
                {user.is_site_admin ? '⚡ Admin do Site' : 'Usuário Padrão'}
              </span>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white p-2 text-base cursor-pointer"
                title="Fechar barra lateral"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Modal de Criação / Acesso de Sala */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl gpu-layer">
            {/* Seletor de Modo (Apenas para salas raiz) */}
            {!modalParentId && (
              <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalMode('create');
                    setError('');
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    modalMode === 'create'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  + Nova Sala
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalMode('join');
                    setError('');
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    modalMode === 'join'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  # Acessar Sala
                </button>
              </div>
            )}

            <h3 className="text-base font-bold text-white mb-1">
              {modalParentId
                ? 'Criar Sub-Canal'
                : modalMode === 'create'
                ? 'Criar Nova Sala'
                : 'Acessar Sala Existente'}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              {modalParentId
                ? 'Canal filho conectado à árvore hierárquica.'
                : modalMode === 'create'
                ? 'Defina a URL e o tempo de vida da sala.'
                : 'Informe o Identificador e Senha para vincular-se e acessar a sala.'}
            </p>

            {error && (
              <div className="p-2.5 mb-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {modalMode === 'join' && !modalParentId ? (
              /* Formulário de Acesso por URL & Senha */
              <form onSubmit={handleJoinExisting} className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Identificador (URL) da Sala
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-zinc-500 font-mono">#</span>
                    <input
                      type="text"
                      placeholder="ex: jorge ou equipe-dev"
                      value={joinNomeUrl}
                      onChange={(e) => setJoinNomeUrl(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Insira o identificador exato da sala que deseja ingressar.
                  </p>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Senha de Acesso (opcional)
                  </label>
                  <input
                    type="password"
                    placeholder="Deixe em branco se a sala for pública"
                    value={joinSenha}
                    onChange={(e) => setJoinSenha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !joinNomeUrl.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#10b981] text-[#050a08] font-bold hover:bg-[#34d399] disabled:opacity-50 cursor-pointer transition-all shadow-md shadow-emerald-500/20"
                  >
                    {loading ? 'Validando...' : 'Acessar Sala'}
                  </button>
                </div>
              </form>
            ) : (
              /* Formulário de Criação */
              <form onSubmit={handleCreate} className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Título Amigável</label>
                  <input
                    type="text"
                    placeholder="ex: Canal Geral Dev"
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Identificador URL</label>
                  <input
                    type="text"
                    placeholder="ex: geral-dev"
                    value={formNomeUrl}
                    onChange={(e) => setFormNomeUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Senha Opcional</label>
                  <input
                    type="password"
                    placeholder="Deixe em branco para pública"
                    value={formSenha}
                    onChange={(e) => setFormSenha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {!modalParentId && (
                  <>
                    {user?.is_site_admin && (
                      <div>
                        <label className="block text-zinc-300 font-medium mb-1">Tipo de Sala</label>
                        <select
                          value={formTipo}
                          onChange={(e) => setFormTipo(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="permanente">Permanente (SaaS / Institucional)</option>
                          <option value="temporaria">Temporária (Efêmera com TTL)</option>
                        </select>
                      </div>
                    )}

                    {formTipo === 'temporaria' && (
                      <div>
                        <label className="block text-zinc-300 font-medium mb-1">TTL (Expiração)</label>
                        <select
                          value={formTtl}
                          onChange={(e) => setFormTtl(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="120">2 Horas</option>
                          <option value="720">12 Horas</option>
                          <option value="1440">24 Horas</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-950/20 border border-purple-500/30">
                  <input
                    type="checkbox"
                    id="secretModeToggle"
                    checked={formIsSecretMode}
                    onChange={(e) => setFormIsSecretMode(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-zinc-900 border-zinc-700 cursor-pointer"
                  />
                  <label htmlFor="secretModeToggle" className="text-xs text-purple-200 cursor-pointer select-none">
                    <span className="font-bold flex items-center gap-1">🔒 Modo Secreto (RF03)</span>
                    <span className="text-[11px] text-zinc-400 block mt-0.5">
                      Retenção zero de histórico e desativação total de exportação de mensagens.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Salvando...' : 'Criar Canal'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Senha para Sala Privada */}
      {passwordModalRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative gpu-layer">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>🔒</span>
                <span>Sala Privada: {passwordModalRoom.titulo || passwordModalRoom.nome_url}</span>
              </h3>
              <button
                onClick={() => {
                  setPasswordModalRoom(null);
                  setRoomPassword('');
                  setPasswordError('');
                }}
                className="text-zinc-400 hover:text-zinc-200 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-4">
              Esta sala é restrita e protegida por senha. Digite a credencial para autenticar e liberar o canal.
            </p>

            {passwordError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <span className="font-bold">⚠️</span>
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleJoinWithPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Senha da Sala
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 text-xs"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalRoom(null);
                    setRoomPassword('');
                    setPasswordError('');
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={joining || !roomPassword.trim()}
                  className="px-4 py-2 rounded-xl bg-[#10b981] hover:bg-[#34d399] text-[#050a08] font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {joining ? 'Validando...' : 'Acessar Sala'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
