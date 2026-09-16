import asyncio
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # Maps sala_id (str) to list of asyncio.Queue
        self.active_rooms: Dict[str, List[asyncio.Queue]] = {}

    async def connect(self, sala_id: str) -> asyncio.Queue:
        queue = asyncio.Queue()
        if sala_id not in self.active_rooms:
            self.active_rooms[sala_id] = []
        self.active_rooms[sala_id].append(queue)
        return queue

    def disconnect(self, sala_id: str, queue: asyncio.Queue):
        if sala_id in self.active_rooms:
            if queue in self.active_rooms[sala_id]:
                self.active_rooms[sala_id].remove(queue)
            if not self.active_rooms[sala_id]:
                del self.active_rooms[sala_id]

    async def broadcast_to_room(self, sala_id: str, message_data: dict):
        if sala_id in self.active_rooms:
            payload = json.dumps(message_data, default=str)
            for queue in self.active_rooms[sala_id]:
                await queue.put(payload)

manager = ConnectionManager()
