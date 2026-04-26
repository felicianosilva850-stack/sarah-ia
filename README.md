# 🐺 LOGAN AI — Bot WhatsApp

Bot inteligente para WhatsApp usando Baileys + Groq AI (LLaMA 3.3 70B).
Arquitetura inspirada na ISA — identidade forte, memória persistente, debounce e naturalidade.

## ⚡ Instalação no Termux (Android)

```bash
# 1. Atualizar e instalar dependências base
pkg update && pkg upgrade -y
pkg install nodejs git -y

# 2. Clonar o projeto
cd /data/data/com.termux/files/home
git clone https://github.com/davyfll472-arch/Logan-ia.git

# 3. Entrar na pasta e instalar
cd Logan-ia
npm install

# 4. Rodar
node index.js
```

### Primeira vez
Na primeira execução, o bot vai pedir o **número do WhatsApp com DDI**.
Exemplo: `557186611701`

Ele vai gerar um **código de pareamento** — vá no WhatsApp → Dispositivos Conectados → Conectar Dispositivo → Inserir código.

### Dica: Manter rodando no Termux
```bash
# Instalar o tmux pra manter rodando em background
pkg install tmux -y

# Criar sessão
tmux new -s logan

# Dentro do tmux, rodar o bot
node index.js

# Pra desanexar: Ctrl+B, depois D
# Pra voltar: tmux attach -t logan
```

## 🧠 Arquitetura

```
Logan-ia/
├── index.js          # Conexão WhatsApp (Baileys)
├── sansekai.js       # Handler de mensagens + IA
├── SYSTEM.md         # Identidade/alma do Logan
├── key.json          # API key do Groq
├── autorizados.json  # Lista de números autorizados
├── notas.json        # Notas persistentes por chat
├── memory/           # Memória isolada por chat (JSON)
├── learnings/        # Logs de erros e eventos
└── lib/
    └── messages.js   # Parser de mensagens do Baileys
```

## 📋 Comandos

| Comando | Descrição | Permissão |
|---------|-----------|-----------|
| `/menu` | Lista de comandos | Todos |
| `/ping` | Testa latência | Todos |
| `/autorizar [num]` | Libera um número | Dono |
| `/remover [num]` | Remove acesso | Dono |
| `/limpar` | Zera memória do chat | Dono |
| `/nota [texto]` | Salva nota no chat | Dono |
| `/notas` | Ver notas do chat | Dono |
| `/delnota [n]` | Apagar nota | Dono |
| `/status` | Status do bot | Dono |
| `/sistema` | Ver/editar system prompt | Dono |
| `/todos` | Marcar todos no grupo | Todos |

## 🔧 Como funciona

- **Em DMs**: Responde sempre (se o número for autorizado)
- **Em Grupos**: Só responde se chamar "Logan" ou marcar o bot
- **Debounce**: Espera 1.5s após a última msg antes de responder (agrupa msgs rápidas)
- **Memória**: Cada chat tem memória isolada (últimas 30 mensagens)
- **Fallback**: Se o modelo principal falhar, usa llama-3.1-8b como backup
- **Reação**: Reage com 🧠 enquanto processa

## 🔑 Configuração

Edite `key.json` com sua API key do Groq:
```json
{
  "keyopenai": "gsk_SUA_CHAVE_GROQ_AQUI"
}
```

Pegue sua chave grátis em: https://console.groq.com/keys

## 📝 Editando a personalidade

Edite o arquivo `SYSTEM.md` — ele contém toda a identidade e regras de comportamento do Logan. Pode editar pelo próprio WhatsApp com `/sistema [nova regra]`.
