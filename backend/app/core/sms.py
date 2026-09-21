import os
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger("nullport.sms")

class BaseSMSProvider(ABC):
    @abstractmethod
    async def send_otp(self, phone: str, code: str) -> bool:
        pass


class MockSMSProvider(BaseSMSProvider):
    """
    Provedor Mock para desenvolvimento e testes automatizados (Zero Cost).
    Registra o código OTP no log e mantém em memória para validação imediata.
    """
    def __init__(self):
        self.sent_codes = {}

    async def send_otp(self, phone: str, code: str) -> bool:
        clean_phone = phone.strip()
        self.sent_codes[clean_phone] = code
        print(f"\n[SMS MOCK] 📱 Código OTP para {clean_phone}: {code}\n")
        logger.info(f"[SMS MOCK] Enviado OTP para {clean_phone}: {code}")
        return True


class TwilioSMSProvider(BaseSMSProvider):
    """
    Provedor Twilio para produção.
    """
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number

    async def send_otp(self, phone: str, code: str) -> bool:
        try:
            from twilio.rest import Client
            client = Client(self.account_sid, self.auth_token)
            message = client.messages.create(
                body=f"Seu codigo de verificacao NullPort e: {code}",
                from_=self.from_number,
                to=phone
            )
            return bool(message.sid)
        except Exception as e:
            logger.error(f"[TWILIO ERROR] Falha ao enviar SMS para {phone}: {e}")
            return False


def get_sms_provider() -> BaseSMSProvider:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")

    if account_sid and auth_token and from_number:
        return TwilioSMSProvider(account_sid, auth_token, from_number)
    
    return MockSMSProvider()

# Instância global padrão
sms_provider = get_sms_provider()
