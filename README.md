# 🔒 NullPort

> **Sistema de Chat Seguro e Efêmero em Tempo Real com SSE (Server-Sent Events) e Acesso Zero-Login.**

O **NullPort** é uma aplicação de chat focada em privacidade extrema, velocidade e capacidade de contornar bloqueios e firewalls corporativos que costumam derrubar conexões WebSocket tradicionais. O acesso é totalmente descentralizado: sem contas, sem e-mails e sem formulários de cadastro.

---

## ⚡ Principais Características

- **Acesso Zero-Login**: Não há cadastro de usuários. Ao digitar o identificador de uma sala e uma senha, a sala é criada automaticamente se for nova ou validada instantaneamente se já existir.
- **Bypass de Firewalls via SSE**: Utiliza **Server-Sent Events (HTTP Streaming)** em vez de WebSockets, garantindo tráfego limpo via portas HTTP/HTTPS padrão.
- **Segurança & Criptografia**: Senhas protegidas com hashing `bcrypt` nativo e sessões autenticadas via **JWT (JSON Web Tokens)** temporários.
- **Compressão Client-Side Obrigatória**: Imagens são comprimidas silenciosamente para menos de 1 MB no próprio navegador via `browser-image-compression` antes do envio.
- **Detecção Automática de Mídia**: Renderização automática de imagens (`.png`, `.jpg`, `.gif`, `.webp`) diretamente na conversa via regex.
- **Notificações em Segundo Plano**: Avisos push via Web Notifications API quando a aba do chat estiver inativa ou em segundo plano.
- **Armazenamento Híbrido & Escalável**:
  - **Supabase (PostgreSQL)** para salas, metadados e histórico de mensagens.
  - **Cloudflare R2 (S3-compatible)** para armazenamento de mídias sem onerar o banco.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
| :--- | :--- |
| **Backend API** | Python 3.12, FastAPI, SQLAlchemy, Uvicorn, Bcrypt, PyJWT, Boto3 |
| **Frontend UI** | React 19, Vite, Tailwind CSS |
| **Banco de Dados** | PostgreSQL hospedado no Supabase (Connection Pooler IPv4) |
| **Storage de Mídia** | Cloudflare R2 |

---

## 📂 Estrutura do Repositório

```text
NullPort/
├── backend/
│   ├── app/
│   │   ├── api/            # Endpoints REST e streaming SSE (auth.py, chat.py)
│   │   ├── core/           # Configurações globais e banco de dados (config.py, database.py)
│   │   ├── models/         # Modelos do SQLAlchemy (Sala, Mensagem)
│   │   ├── schemas/        # Validações de entrada/saída Pydantic
│   │   ├── services/       # Lógica pesada (SSE manager, hash bcrypt, storage R2)
│   │   └── main.py         # Ponto de entrada FastAPI com CORS configurado
│   ├── .env                # Credenciais do Supabase e Cloudflare R2
│   └── requirements.txt    # Dependências Python
│
└── frontend/
    ├── src/
    │   ├── assets/         # Ícones e assets estáticos
    │   ├── components/     # Botão, Input, Modal reaproveitáveis
    │   ├── features/       # Componentes específicos (ChatBox, LoginForm)
    │   ├── services/       # Clientes de API (fetch, auth, conexões SSE)
    │   ├── utils/          # Compressão client-side e regex de imagens
    │   ├── App.jsx         # Gerenciador de estado e telas
    │   ├── main.jsx        # Ponto de entrada React
    │   └── index.css       # Estilos globais e Tailwind CSS
    ├── .env                # Variáveis de ambiente (URL da API)
    ├── package.json
    ├── tailwind.config.js
    └── vite.config.js
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Python 3.12+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)

---

### 1. Configurando o Backend (FastAPI)

1. Crie e ative um ambiente virtual:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\activate
   ```

2. Instale as dependências:
   ```powershell
   pip install -r backend/requirements.txt
   ```

3. Configure o arquivo `backend/.env` (ou na raiz do projeto):
   ```env
   # String de Conexão do Supabase (Recomendado utilizar o Pooler IPv4)
   DATABASE_URL="postgresql://postgres.[SEU_PROJETO]:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

   # Chave Secreta para assinatura dos tokens JWT
   SECRET_KEY="sua_chave_secreta_super_segura_aqui"
   ALGORITHM="HS256"
   ACCESS_TOKEN_EXPIRE_MINUTES=1440

   # Cloudflare R2 (Opcional para upload de imagens)
   R2_ACCOUNT_ID="seu_account_id"
   R2_ACCESS_KEY_ID="seu_access_key_id"
   R2_SECRET_ACCESS_KEY="seu_secret_access_key"
   R2_BUCKET_NAME="nullport-images"
   R2_PUBLIC_URL="https://pub-[hash].r2.dev"
   ```

4. Inicie o servidor FastAPI:
   ```powershell
   cd backend
   uvicorn app.main:app --reload --port 8000
   ```
   Acesse a documentação Swagger em: `http://127.0.0.1:8000/docs`.

---

### 2. Configurando o Frontend (React + Vite)

1. Entre na pasta do frontend e instale os pacotes:
   ```powershell
   cd frontend
   npm install
   ```

2. Crie ou verifique o arquivo `frontend/.env`:
   ```env
   VITE_API_URL=http://localhost:8000
   ```

3. Inicie o servidor de desenvolvimento:
   ```powershell
   npm run dev
   ```
   Acesse o chat em: `http://localhost:5173`.

---

## 🌐 Guia de Deploy em Produção

Como o NullPort utiliza **Server-Sent Events (SSE)** com canais abertos contínuos em tempo real, a melhor arquitetura de hospedagem recomendada (e com plano gratuito) é:

```
[ Usuário / Navegador ]
        │
        ├──▶ Frontend SPA (React + Vite) ──▶ Hospedado na VERCEL
        │
        └──▶ Backend API (FastAPI + SSE)  ──▶ Hospedado no RENDER (ou Railway)
                     │
                     └──▶ Banco de Dados ──▶ SUPABASE (PostgreSQL)
```

### Deploy do Frontend (Vercel)
1. Conecte o repositório na **[Vercel](https://vercel.com/)**.
2. Defina o **Root Directory** como `frontend`.
3. Adicione a variável de ambiente:
   - `VITE_API_URL`: URL pública da sua API no Render (ex: `https://nullport-api.onrender.com`).

### Deploy do Backend (Render.com)
1. Crie um novo **Web Service** no **[Render](https://render.com/)**.
2. Defina o **Root Directory** como `backend`.
3. Configure os comandos:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Adicione as variáveis de ambiente (`DATABASE_URL`, `SECRET_KEY`, etc.) no painel do Render.

---

## 🛡️ Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais detalhes.
