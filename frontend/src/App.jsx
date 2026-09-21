import React, { useState, useEffect } from 'react';
import LoginForm from './features/LoginForm';
import ChatBox from './features/ChatBox';
import RoomTreeSidebar from './features/RoomTreeSidebar';
import GalaxyCanvas from './components/GalaxyCanvas';
import { getCurrentUser, getMe, logout } from './services/auth';
import { fetchRooms, fetchMyRooms, createRoom, createSubroom } from './services/chat';

export default function App() {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Inicializa sessão
  useEffect(() => {
    const initSession = async () => {
      const savedUser = getCurrentUser();
      if (savedUser) {
        setUser(savedUser);
        if (savedUser.sala_id) {
          setActiveRoom({
            id: savedUser.sala_id,
            nome_url: savedUser.nome_url || 'sala',
            titulo: savedUser.nome_url || 'Sala',
          });
        }
        // Atualiza perfil caso tenha mudado no backend preservando sala_id e identificadores locais
        const refreshed = await getMe();
        if (refreshed) {
          setUser((prev) => ({ ...prev, ...refreshed }));
        }
      }
      setLoading(false);
    };
    initSession();
  }, []);

  // Carrega salas quando o usuário estiver logado (Zero-Discovery: apenas salas onde o usuário é membro ativo)
  const loadRooms = async () => {
    try {
      const roomsData = await fetchMyRooms();
      setRooms(roomsData);
      // Se tiver sala ativa prévia, sincroniza metadados sem perder a seleção; caso contrário, seleciona a primeira
      setActiveRoom((prev) => {
        if (prev) {
          const match = roomsData.find((r) => r.id === prev.id);
          if (match) {
            if (match.nome_url !== prev.nome_url || match.titulo !== prev.titulo || match.is_secret_mode !== prev.is_secret_mode) {
              return { ...prev, ...match };
            }
            return prev;
          }
          return prev;
        }
        return roomsData.length > 0 ? roomsData[0] : null;
      });
    } catch (err) {
      console.error("Erro ao carregar salas:", err);
    }
  };

  useEffect(() => {
    if (user) {
      loadRooms();
    }
  }, [user]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    if (userData.is_legacy_room) {
      setActiveRoom({
        id: userData.sala_id,
        nome_url: userData.nome_url,
        titulo: userData.nome_url,
      });
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setRooms([]);
    setActiveRoom(null);
  };

  const handleCreateRoom = async (roomData) => {
    const newRoom = await createRoom(roomData);
    setRooms((prev) => [newRoom, ...prev]);
    setActiveRoom(newRoom);
  };

  const handleCreateSubroom = async (parentId, subData) => {
    const newSub = await createSubroom(parentId, subData);
    setRooms((prev) => [...prev, newSub]);
    setActiveRoom(newSub);
  };

  const handleJoinRoom = (joinedRoom) => {
    setRooms((prev) => {
      const exists = prev.some((r) => r.id === joinedRoom.id);
      if (exists) {
        return prev.map((r) => (r.id === joinedRoom.id ? { ...joinedRoom, is_membro: true } : r));
      }
      return [joinedRoom, ...prev];
    });
    setActiveRoom(joinedRoom);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050a08] text-zinc-400 text-xs">
        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping mr-3"></span>
        Iniciando NullPort...
      </div>
    );
  }

  // Se não estiver logado, exibe a Login Page Split-Screen completa
  if (!user) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <main className="min-h-screen flex relative bg-[#050a08] text-zinc-100 font-sans overflow-hidden">
      {/* Background de Ambiência no Chat (Ambient Overlay com 700 partículas e opacidade 0.35) */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <GalaxyCanvas particleCount={700} interactive={false} opacity={0.35} />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Hierárquica em Árvore */}
        <RoomTreeSidebar
          rooms={rooms}
          activeRoom={activeRoom}
          onSelectRoom={(room) => {
            setActiveRoom(room);
            setIsSidebarOpen(false);
            setRooms((prev) =>
              prev.map((r) => (r.id === room.id ? { ...r, is_membro: true } : r))
            );
          }}
          onCreateRoom={handleCreateRoom}
          onCreateSubroom={handleCreateSubroom}
          onJoinRoom={handleJoinRoom}
          user={user}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Área Principal de Chat */}
        <div className="flex-1 flex flex-col justify-center items-center p-2 md:p-6 overflow-hidden">
          <ChatBox
            user={user}
            activeRoom={activeRoom}
            onLogout={handleLogout}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        </div>
      </div>
    </main>
  );
}
