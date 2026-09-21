import asyncio
import json
import logging
from typing import Callable, Dict, Set, Optional
from app.core.config import settings

logger = logging.getLogger("nullport.redis")

class PubSubBroker:
    """Interface base para distribuição de eventos PubSub entre nós de backend."""
    async def publish(self, channel: str, message: str) -> None:
        raise NotImplementedError

    async def subscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        raise NotImplementedError

    async def unsubscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        raise NotImplementedError


class InMemoryPubSubBroker(PubSubBroker):
    """
    Broker PubSub em memória thread-safe/asyncio para simular múltiplas réplicas
    de backend e garantir testes locais determinísticos sem dependência externa.
    """
    def __init__(self):
        # Maps channel (str) -> set of callbacks
        self._channels: Dict[str, Set[Callable[[str, str], None]]] = {}

    async def publish(self, channel: str, message: str) -> None:
        if channel in self._channels:
            subscribers = list(self._channels[channel])
            for cb in subscribers:
                try:
                    res = cb(channel, message)
                    if asyncio.iscoroutine(res):
                        asyncio.create_task(res)
                except Exception as e:
                    logger.error(f"Erro no callback do canal {channel}: {e}")

    async def subscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        if channel not in self._channels:
            self._channels[channel] = set()
        self._channels[channel].add(callback)

    async def unsubscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        if channel in self._channels:
            self._channels[channel].discard(callback)
            if not self._channels[channel]:
                del self._channels[channel]


class RedisPubSubBroker(PubSubBroker):
    """
    Broker de produção integrado com Upstash Redis ou Redis genérico.
    Publica e escuta tópicos 'room:{room_id}' usando redis-py assíncrono.
    Possui fallback automático para InMemoryPubSubBroker se Redis não estiver acessível.
    """
    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.REDIS_URL or settings.UPSTASH_REDIS_URL
        self._redis = None
        self._pubsub = None
        self._callbacks: Dict[str, Set[Callable[[str, str], None]]] = {}
        self._fallback = InMemoryPubSubBroker()
        self._listener_task: Optional[asyncio.Task] = None
        self._is_connected = False

    async def _init_redis(self):
        if self._redis is not None or not self.redis_url:
            return

        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3
            )
            # Testa conexão
            await self._redis.ping()
            self._pubsub = self._redis.pubsub()
            self._is_connected = True
            logger.info("Conectado com sucesso ao Upstash / Redis PubSub.")
        except Exception as e:
            logger.warning(f"Não foi possível conectar ao Redis ({e}). Utilizando broker PubSub em memória.")
            self._redis = None
            self._pubsub = None
            self._is_connected = False

    async def _listen_loop(self):
        try:
            while self._is_connected and self._pubsub:
                message = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("type") == "message":
                    channel = message.get("channel")
                    data = message.get("data")
                    if channel in self._callbacks:
                        for cb in list(self._callbacks[channel]):
                            try:
                                res = cb(channel, data)
                                if asyncio.iscoroutine(res):
                                    asyncio.create_task(res)
                            except Exception as e:
                                logger.error(f"Erro ao processar mensagem do Redis: {e}")
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Erro no loop de escuta do Redis: {e}")

    async def publish(self, channel: str, message: str) -> None:
        await self._init_redis()
        # Notifica inscritos locais e do fallback
        await self._fallback.publish(channel, message)

        if self._is_connected and self._redis:
            try:
                await self._redis.publish(channel, message)
            except Exception as e:
                logger.error(f"Falha ao publicar evento no Redis: {e}")

    async def subscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        await self._init_redis()
        await self._fallback.subscribe(channel, callback)

        if channel not in self._callbacks:
            self._callbacks[channel] = set()
        self._callbacks[channel].add(callback)

        if self._is_connected and self._pubsub:
            try:
                await self._pubsub.subscribe(channel)
                if not self._listener_task or self._listener_task.done():
                    self._listener_task = asyncio.create_task(self._listen_loop())
            except Exception as e:
                logger.error(f"Falha ao subscrever canal {channel} no Redis: {e}")

    async def unsubscribe(self, channel: str, callback: Callable[[str, str], None]) -> None:
        await self._fallback.unsubscribe(channel, callback)
        if channel in self._callbacks:
            self._callbacks[channel].discard(callback)
            if not self._callbacks[channel]:
                del self._callbacks[channel]
                if self._is_connected and self._pubsub:
                    try:
                        await self._pubsub.unsubscribe(channel)
                    except Exception as e:
                        logger.error(f"Falha ao desinscrever canal {channel} no Redis: {e}")


# Instância global padrão do broker PubSub
default_broker = RedisPubSubBroker()
