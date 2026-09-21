import asyncio
from typing import Dict, List, Optional
import json
import uuid
from app.core.redis import default_broker, PubSubBroker

class ConnectionManager:
    def __init__(self, broker: Optional[PubSubBroker] = None):
        self.instance_id = uuid.uuid4().hex
        self.broker = broker or default_broker
        # Maps sala_id (str) to list of asyncio.Queue
        self.active_rooms: Dict[str, List[asyncio.Queue]] = {}
        # Maps sala_id (str) to dict of user_id (str) -> count of open connections
        self.room_users: Dict[str, Dict[str, int]] = {}
        # Maps queue to (sala_id, user_id)
        self.queue_meta: Dict[asyncio.Queue, tuple] = {}
        # Subscribed channels tracking
        self._subscribed_channels: set = set()

    def _channel_name(self, sala_id: str) -> str:
        return f"room:{sala_id}"

    async def _handle_broker_message(self, channel: str, message: str):
        """Recebe mensagens publicadas por outras réplicas e entrega localmente."""
        try:
            payload = json.loads(message)
            sender_id = payload.get("_sender_instance")
            # Se a mensagem foi originada por esta mesma instância, ignora (já entregue)
            if sender_id == self.instance_id:
                return

            event_data = payload.get("data", payload)
            sala_id = channel.replace("room:", "")
            await self._deliver_local(sala_id, event_data)
        except Exception as e:
            # Em caso de mensagem já direta
            sala_id = channel.replace("room:", "")
            await self._deliver_local(sala_id, message)

    async def _deliver_local(self, sala_id: str, message_data):
        """Entrega o evento diretamente a todas as conexões SSE ativas locais desta sala."""
        s_id = str(sala_id)
        if s_id in self.active_rooms:
            if isinstance(message_data, (dict, list)):
                payload = json.dumps(message_data, default=str)
            else:
                payload = str(message_data)

            for queue in list(self.active_rooms[s_id]):
                await queue.put(payload)

    async def connect(self, sala_id: str, user_id: str = None) -> asyncio.Queue:
        s_id = str(sala_id)
        queue = asyncio.Queue()
        if s_id not in self.active_rooms:
            self.active_rooms[s_id] = []
            # Inscreve no canal PubSub se for a primeira conexão local desta sala
            channel = self._channel_name(s_id)
            if channel not in self._subscribed_channels:
                self._subscribed_channels.add(channel)
                if self.broker:
                    await self.broker.subscribe(channel, self._handle_broker_message)

        self.active_rooms[s_id].append(queue)

        if user_id:
            u_id = str(user_id)
            self.queue_meta[queue] = (s_id, u_id)
            if s_id not in self.room_users:
                self.room_users[s_id] = {}
            prev_count = self.room_users[s_id].get(u_id, 0)
            self.room_users[s_id][u_id] = prev_count + 1

            if prev_count == 0:
                await self.broadcast_to_room(s_id, {
                    "type": "presence_update",
                    "user_id": u_id,
                    "is_online": True
                })

        return queue

    def disconnect(self, sala_id: str, queue: asyncio.Queue):
        s_id = str(sala_id)
        if s_id in self.active_rooms:
            if queue in self.active_rooms[s_id]:
                self.active_rooms[s_id].remove(queue)
            if not self.active_rooms[s_id]:
                del self.active_rooms[s_id]
                # Cancela inscrição do canal PubSub se não há mais clientes locais
                channel = self._channel_name(s_id)
                if channel in self._subscribed_channels:
                    self._subscribed_channels.discard(channel)
                    if self.broker:
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(self.broker.unsubscribe(channel, self._handle_broker_message))
                        except RuntimeError:
                            pass

        meta = self.queue_meta.pop(queue, None)
        if meta:
            _, u_id = meta
            if s_id in self.room_users and u_id in self.room_users[s_id]:
                self.room_users[s_id][u_id] -= 1
                if self.room_users[s_id][u_id] <= 0:
                    del self.room_users[s_id][u_id]
                    if not self.room_users[s_id]:
                        del self.room_users[s_id]

                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(self.broadcast_to_room(s_id, {
                            "type": "presence_update",
                            "user_id": u_id,
                            "is_online": False
                        }))
                    except RuntimeError:
                        pass

    def get_online_user_ids(self, sala_id: str) -> set:
        s_id = str(sala_id)
        return set(self.room_users.get(s_id, {}).keys())

    async def _safe_broker_publish(self, channel: str, envelope: str):
        try:
            await asyncio.wait_for(self.broker.publish(channel, envelope), timeout=2.0)
        except Exception:
            pass

    async def broadcast_to_room(self, sala_id: str, message_data: dict):
        s_id = str(sala_id)
        # 1. Entrega local imediata para clientes conectados nesta réplica
        await self._deliver_local(s_id, message_data)

        # 2. Publica no canal Redis/PubSub para as demais réplicas sem bloquear o request HTTP
        if self.broker:
            channel = self._channel_name(s_id)
            envelope = json.dumps({
                "_sender_instance": self.instance_id,
                "data": message_data
            }, default=str)
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._safe_broker_publish(channel, envelope))
            except RuntimeError:
                pass


manager = ConnectionManager()
