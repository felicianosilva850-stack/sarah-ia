# 🐺 LOGAN AI — Bot WhatsApp

Bot inteligente para WhatsApp usando Baileys + Suporte Multi-API (Gemini, Groq, OpenRouter & Ollama).
Arquitetura modular com memória inteligente, anti-spam, debounce e suporte a ferramentas (skills).

## ⚡ Instalação Rápida no Termux (Android)

Se você quiser instalar tudo de uma vez, copie e cole no Termux:

```bash
pkg update && pkg upgrade -y && pkg install nodejs git -y && cd /data/data/com.termux/files/home && git clone https://github.com/davyfll472-arch/Logan-ia.git && cd Logan-ia && npm install && npm start
```

---

## 🔄 Como Atualizar o Bot

Sempre que houver mudanças no repositório, use estes comandos para atualizar:

```bash
cd /data/data/com.termux/files/home/Logan-ia
git pull
npm install
npm start
```

## 🧠 Comandos de Administração (Dono)

O bot permite alternar entre provedores de IA e gerenciar chaves diretamente pelo WhatsApp:

- **Configurar Provedor**: `/provider [gemini|groq|ollama|openrouter]`
  - Exemplo: `/provider openrouter`
- **Adicionar Chaves**: `/addkey [CHAVE]`
  - O bot identifica sozinho se é Gemini, Groq ou OpenRouter
  - Exemplo: `/addkey AIzaSy...` (Gemini)
  - Exemplo: `/addkey gsk_...` (Groq)
  - Exemplo: `/addkey sk-or-v1-...` (OpenRouter)
- **Resetar Conversa**: `/reset`
  - Limpa o histórico do chat atual

## 🔑 Provedores de IA Suportados

| Provedor | Modelos | Observações |
|----------|---------|-------------|
| **Gemini** | gemini-1.5-flash, etc | Function Calling nativo, Google |
| **Groq** | llama-3.3-70b-versatile, etc | Alta velocidade, Meta |
| **OpenRouter** | deepseek, gemini, claude, etc | Acesso a 100+ modelos |
| **Ollama** | qwen, llama, mistral, etc | Modelos locais, sem internet |

O sistema gerencia a **rotação automática de chaves** para cada provedor. Se uma chave falhar ou atingir o limite, o bot rotaciona para a próxima automaticamente.

## 🛠️ Skills (Ferramentas)

A IA pode usar ferramentas automaticamente durante a conversa:

| Skill | Descrição |
|-------|-----------|
| `consultar_clima` | Previsão do tempo de qualquer cidade |
| `adicionar_lembrete` | Agenda lembretes que disparam no horário marcado |
| `run_terminal` | Executa comandos no terminal do sistema |
| `buscar_web` | Pesquisa informações na internet em tempo real |

Para adicionar novas skills, crie um arquivo `.js` na pasta `skills/` seguindo o padrão dos existentes.

## 🧠 Sistema de Memória

- Histórico de até **50 mensagens** por chat, salvo localmente
- **Resumo automático**: quando o histórico passa de 40 mensagens, as mais antigas são resumidas automaticamente para manter o contexto sem perder informação
- Cada chat (PV e grupo) tem memória isolada

## 🛡️ Anti-Spam

Sistema de rate limiting integrado que bloqueia automaticamente usuários que enviam mais de 10 mensagens por minuto. Reset automático após 60 segundos.

## 📁 Estrutura do Projeto

```
├── index.js              # Conexão e pareamento via Baileys
├── sansekai.js            # Handler principal do WhatsApp + lógica de IA
├── terminal.js            # Chat com a Sarah direto pelo terminal
├── menu.js                # Menu de controle interativo
├── apiKeyManager.js       # Gerenciador de chaves Gemini/Groq com rotação
├── autorizados.json       # Lista de números autorizados como dono
├── settings.json          # Configurações (provedor, modelo, chaves)
├── SYSTEM.md              # Personalidade e regras da IA
├── lib/
│   ├── providers.js       # Funções de cada provedor de IA
│   ├── memory.js          # Sistema de memória com resumo automático
│   ├── skills-loader.js   # Carregamento dinâmico de skills
│   ├── anti-spam.js       # Rate limiting por usuário
│   ├── messages.js        # Parser de mensagens do Baileys
│   └── reminders.js       # Sistema de lembretes
├── skills/                # Ferramentas que a IA pode usar
├── memory/                # Histórico de conversas por chat
└── yusril/                # Sessão do WhatsApp (credenciais)
```

## 💻 Menu de Controle

Ao rodar `npm start`, um menu interativo permite:
- Trocar provedor (Gemini, Groq, Ollama, OpenRouter)
- Ver e trocar o modelo ativo
- Apagar sessão do WhatsApp
- Iniciar o bot

## 👑 Primeiro Acesso (Setup)

Na primeira execução, o bot pedirá o número de telefone e exibirá um código de pareamento no terminal. Use esse código no WhatsApp para conectar.

---
*Desenvolvido para Davy*
