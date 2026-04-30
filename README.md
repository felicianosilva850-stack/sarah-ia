# 🐺 LOGAN AI — Bot WhatsApp

Bot inteligente para WhatsApp usando Baileys + Suporte Multi-API (Gemini & Groq).
Arquitetura robusta com memória isolada, debounce e suporte a ferramentas (skills).

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

O bot agora permite alternar entre provedores de IA e gerenciar chaves diretamente pelo WhatsApp:

- **Configurar Provedor**: `/provider [gemini|groq]`
  - Exemplo: `/provider groq`
- **Adicionar Chaves**: `/addkey [gemini|groq] [CHAVE]`
  - Exemplo: `/addkey gemini AIzaSy...`
  - Exemplo: `/addkey groq gsk_...`

## 🔑 Configuração das APIs

- **Gemini**: Suporta Function Calling (Skills) e modelos de alta performance (Google).
- **Groq**: Alta velocidade com modelos Llama (Meta).

O sistema gerencia a **rotação automática de chaves** para cada provedor. Se uma chave falhar ou atingir o limite, o bot rotaciona para a próxima automaticamente.

## 📁 Estrutura do Projeto

- `index.js`: Conexão e pareamento via Baileys.
- `sansekai.js`: Cérebro do bot, gerencia a lógica de IA e comandos.
- `apiKeyManager.js`: Gerenciador de chaves Gemini/Groq com rotação.
- `SYSTEM.md`: Definição de personalidade e regras da IA.
- `settings.json`: Configurações de dono e provedor ativo.
- `skills/`: Ferramentas que a IA pode usar (ex: consultar clima, rodar terminal).
- `memory/`: Histórico de conversas salvo localmente por chat.

## 👑 Primeiro Acesso (Setup)
Na primeira execução, o bot exibirá um código no terminal (ex: `/setup 123456`). Envie este comando no WhatsApp do bot para se tornar o dono oficial e liberar os comandos de administração.

---
*Desenvolvido para Davy*
