import asyncio
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # Maps sala_id (str) to list of asyncio.Queue
        self.active_rooms: Dict[str, List[asyncio.Queue]] = {}
        # Maps sala_id (str) to dict of user_id (str) -> count of open connections
        self.room_users: Dict[str, Dict[str, int]] = {}
        # Maps queue to (sala_id, user_id)
        self.queue_meta: Dict[asyncio.Queue, tuple] = {}

    async def connect(self, sala_id: str, user_id: str = None) -> asyncio.Queue:
        s_id = str(sala_id)
        queue = asyncio.Queue()
        if s_id not in self.active_rooms:
            self.active_rooms[s_id] = []
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

    async def broadcast_to_room(self, sala_id: str, message_data: dict):
        s_id = str(sala_id)
        if s_id in self.active_rooms:
            payload = json.dumps(message_data, default=str)
            for queue in self.active_rooms[s_id]:
                await queue.put(payload)

manager = ConnectionManager()
