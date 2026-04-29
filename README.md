# 🐺 SARAH AI — Bot WhatsApp

Bot inteligente para WhatsApp usando Baileys + Groq AI (LLaMA 3.3 70B).
Arquitetura inspirada na ISA — identidade forte, memória persistente, debounce e naturalidade.

## ⚡ Instalação Rápida no Termux (Android)

Se você quiser instalar tudo de uma vez, clique no botão de copiar ali no canto direito do quadro abaixo e cole no Termux:

```bash
pkg update && pkg upgrade -y && pkg install nodejs git -y && cd /data/data/com.termux/files/home && git clone https://github.com/davyfll472-arch/Logan-ia.git && cd Logan-ia && npm install && npm start
```

---

### Instalação Passo a Passo (se preferir)

**1. Atualizar e instalar dependências base**
```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
```

**2. Clonar o projeto**
```bash
cd /data/data/com.termux/files/home
git clone https://github.com/davyfll472-arch/Logan-ia.git
```

**3. Entrar na pasta e instalar**
```bash
cd Logan-ia
npm install
```

**4. Rodar**
```bash
npm start
```

### Primeira vez
Na primeira execução, o bot vai pedir o **número do WhatsApp com DDI**.
Exemplo: `5511999999999`

Ele vai gerar um **código de pareamento** — vá no WhatsApp → Dispositivos Conectados → Conectar Dispositivo → Inserir código.

### Dica: Manter rodando no Termux
```bash
# Instalar o tmux pra manter rodando em background
pkg install tmux -y

# Criar sessão
tmux new -s logan

# Dentro do tmux, rodar o bot
npm start

# Pra desanexar: Ctrl+B, depois D
# Pra voltar: tmux attach -t logan
```

## 🔄 Como Atualizar o Bot

Quando sair uma versão nova no GitHub, você não precisa apagar nada, é só puxar a atualização:

```bash
cd /data/data/com.termux/files/home/Logan-ia
git pull
npm install
npm start
```

## 🧠 Arquitetura

```
Logan-ia/
├── index.js          # Conexão WhatsApp (Baileys)
├── sansekai.js       # Handler de mensagens + IA
├── SYSTEM.md         # Identidade/alma do Sarah
├── key.json          # API key do Groq
├── autorizados.json  # Lista de números autorizados
├── notas.json        # Notas persistentes por chat
├── memory/           # Memória isolada por chat (JSON)
├── learnings/        # Logs de erros e eventos
└── lib/
    └── messages.js   # Parser de mensagens do Baileys
```

## 🔧 
## 👑 Primeiro Acesso (Setup do Dono)
Para garantir a segurança, ao iniciar o bot (npm start), ele vai exibir um código no terminal (ex: /setup 123456). Mande isso do seu WhatsApp para o bot para se tornar o dono oficial! Depois, use /addkey gsk_CHAVE para configurar a IA pelo zap.

Como funciona

- **Em DMs**: Responde sempre (se o número for autorizado)
- **Em Grupos**: Só responde se chamar "Sarah" ou marcar o bot
- **Debounce**: Espera 1.5s após a última msg antes de responder (agrupa msgs rápidas)
- **Memória**: Cada chat tem memória isolada (últimas 30 mensagens)
- **Fallback**: Se o modelo principal falhar, usa llama-3.1-8b como backup
- **Reação**: Reage com 🧠 enquanto processa

## 🔑 Configuração

Renomeie o arquivo `key.example.json` para `key.json` e adicione suas chaves da API da Groq.

O sistema agora suporta **rotação automática de chaves (Anti-Ban/Rate Limit)**! Se uma chave estourar o limite de uso (erro 429) ou falhar, o bot pula para a próxima da fila automaticamente sem perder a mensagem.

```json
{
  "keys": [
    "gsk_SUA_CHAVE_1",
    "gsk_SUA_CHAVE_2",
    "gsk_SUA_CHAVE_3"
  ]
}
```

Pegue suas chaves grátis em: https://console.groq.com/keys

## 📝 Editando a personalidade

Edite o arquivo `SYSTEM.md` — ele contém toda a identidade e regras de comportamento do Sarah. Pode editar pelo próprio WhatsApp com `/sistema [nova regra]`.
