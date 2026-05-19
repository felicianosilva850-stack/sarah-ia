const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType } = require("@whiskeysockets/baileys");
const fs = require("fs"), util = require("util"), chalk = require("chalk"), path = require("path");
const { exec } = require("child_process");
const apiKeyManager = require("./apiKeyManager");

// ══════════════════════════════════════════
//        MÓDULOS EXTRAÍDOS
// ══════════════════════════════════════════

const { executeGemini, executeGroq, executeOpenRouter, executeOllama, callProvider } = require("./lib/providers");
const { getMemory, saveMemory, summarizeIfNeeded, MEMORY_DIR } = require("./lib/memory");
const { loadedSkills, groqTools, convertToolToGemini } = require("./lib/skills-loader");

// ══════════════════════════════════════════
//        ARQUITETURA MODULAR
// ══════════════════════════════════════════

// Diretórios
const LEARNINGS_DIR = path.join(__dirname, "learnings");
if (!fs.existsSync(LEARNINGS_DIR)) fs.mkdirSync(LEARNINGS_DIR);

// Arquivos core
const SYSTEM_FILE = path.join(__dirname, "SYSTEM.md");
const AUTORIZADOS_FILE = path.join(__dirname, "autorizados.json");
const NOTAS_FILE = path.join(__dirname, "notas.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

// Carregar settings
let settings = { 
    isPublic: true, 
    owners: [], 
    provider: "gemini", // padrão
    groqModel: "llama-3.3-70b-versatile",
    geminiModel: "gemini-1.5-flash"
};

if (fs.existsSync(SETTINGS_FILE)) {
    try { 
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        settings = { ...settings, ...parsed };
    } catch (e) { }
}
const salvarSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// ══════════════════════════════════════════
//  LÓGICA PRINCIPAL DE CHAMADA
// ══════════════════════════════════════════

async function callAI(chatId, pushname, input, isOwner) {
    let history = getMemory(chatId);
    history = summarizeIfNeeded(history);
    let systemPrompt = fs.readFileSync(SYSTEM_FILE, 'utf8');
    const geminiHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    const promptFormatado = `[De: ${pushname}] ${input}`;
    let finalResponse = "";

    try {
        if (settings.provider === 'openrouter') {
            let tools = isOwner ? groqTools : [];
            let res = await executeOpenRouter(geminiHistory, promptFormatado, systemPrompt, tools);
            
            if (res.functionCalls && res.functionCalls.length > 0) {
                const functionResponses = [];
                for (const call of res.functionCalls) {
                    const skill = loadedSkills[call.name];
                    if (skill) {
                        const result = await skill.execute(call.args, { chatId });
                        functionResponses.push({
                            tool_call_id: call.id,
                            role: "tool",
                            name: call.name,
                            content: String(result)
                        });
                    }
                }
                const resTool = await executeOpenRouter(geminiHistory, res.messages.concat(functionResponses), systemPrompt, tools);
                finalResponse = resTool.text;
            } else {
                finalResponse = res.text;
            }
        } else if (settings.provider === 'ollama') {
            let tools = []; // Desativado para evitar erro 400 Bad Request de modelos sem suporte a tools nativo
            let res = await executeOllama(geminiHistory, promptFormatado, systemPrompt, tools);
            
            if (res.functionCalls && res.functionCalls.length > 0) {
                const functionResponses = [];
                for (const call of res.functionCalls) {
                    const skill = loadedSkills[call.name];
                    if (skill) {
                        const result = await skill.execute(call.args, { chatId });
                        functionResponses.push({
                            role: 'tool',
                            content: String(result)
                        });
                    }
                }
                const resTool = await executeOllama(geminiHistory, res.messages.concat(functionResponses), systemPrompt, tools);
                finalResponse = resTool.text;
            } else {
                finalResponse = res.text;
            }
        } else if (settings.provider === "groq") {
            let tools = isOwner ? groqTools : [];
            let res = await executeGroq(geminiHistory, promptFormatado, systemPrompt, tools);
            
            if (res.functionCalls && res.functionCalls.length > 0) {
                const functionResponses = [];
                for (const call of res.functionCalls) {
                    const skill = loadedSkills[call.name];
                    if (skill) {
                        const result = await skill.execute(call.args, { chatId });
                        functionResponses.push({
                            tool_call_id: call.id,
                            role: "tool",
                            name: call.name,
                            content: String(result)
                        });
                    }
                }
                const resTool = await executeGroq(geminiHistory, res.messages.concat(functionResponses), systemPrompt, tools);
                finalResponse = resTool.text;
            } else {
                finalResponse = res.text;
            }
        } else {
            // Gemini com suporte a Tools
            let geminiTools = isOwner ? groqTools.map(convertToolToGemini) : [];
            let res = await executeGemini(geminiHistory, promptFormatado, geminiTools, systemPrompt);
            
            if (res.functionCalls && res.functionCalls.length > 0) {
                const functionResponses = [];
                for (const call of res.functionCalls) {
                    const skill = loadedSkills[call.name];
                    if (skill) {
                        const result = await skill.execute(call.args, { chatId });
                        functionResponses.push({ functionResponse: { name: call.name, response: { result: String(result) } } });
                    }
                }
                const resTool = await executeGemini(res.chat.getHistory(), functionResponses, geminiTools, systemPrompt);
                finalResponse = resTool.text;
            } else {
                finalResponse = res.text;
            }
        }
    } catch (e) {
        console.error(chalk.red(`[ERRO AI]`), e);
        finalResponse = `Erro na conexão com ${settings.provider}. Tenta de novo?`;
    }

    history.push({ role: 'user', content: promptFormatado });
    history.push({ role: 'assistant', content: finalResponse });
    saveMemory(chatId, history);
    return finalResponse;
}

// ══════════════════════════════════════════
//  HANDLER DO WHATSAPP
// ══════════════════════════════════════════

const pendingMessages = new Map();
const recentSentTexts = new Set();

module.exports = sansekai = async (sock, message) => {
    try {
        if (!message.message) return;
        let budy = (typeof message.text == 'string' ? message.text : '');
        if (!budy || budy.includes('\u200B')) return;

        const from = message.chat;
        const sender = (message.sender || "").split('@')[0];
        const pushname = message.pushName || "Usuário";
        const isOwner = ["559491855060", "5594991855060", "236949688311960", "101679106150440"].includes(sender) || message.key.fromMe;

        // Log visual no terminal
        const shortText = budy.length > 60 ? budy.substring(0, 60) + "..." : budy;
        console.log(chalk.yellow('[💬]') + ' ' + chalk.cyan(pushname) + ' ' + chalk.gray(`(${sender})`) + ': ' + chalk.white(shortText));

        // Filtro de Grupos
        if (from.endsWith('@g.us')) {
            const botNumber = sock.user?.id?.split(':')[0] || "";
            const isQuotingBot = message.message?.extendedTextMessage?.contextInfo?.participant?.includes(botNumber);
            const isMentioningBot = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.some(jid => jid.includes(botNumber));
            const hasName = budy.toLowerCase().includes('sarah');
            if (!isQuotingBot && !isMentioningBot && !hasName) return;
        }

        // Comandos de Admin
        if (isOwner && budy.startsWith('/')) {
            const args = budy.replace(/\s+/g, ' ').split(' ');
            const cmd = args[0].toLowerCase() === '/' ? '/' + (args[1] || '').toLowerCase() : args[0].toLowerCase();
            const realArgs = args[0].toLowerCase() === '/' ? args.slice(1) : args;

            if (cmd === '/provider') {
                const p = realArgs[1]?.toLowerCase();
                if (['gemini', 'groq', 'ollama', 'openrouter'].includes(p)) {
                    settings.provider = p;
                    salvarSettings();
                    return await message.reply(`✅ Provedor alterado para: ${p}`);
                }
                return await message.reply('Uso: /provider [gemini|groq|ollama|openrouter]');
            }

            if (cmd === '/reset') {
                const safeName = from.replace(/[^a-zA-Z0-9@._-]/g, '_');
                const memFile = path.join(MEMORY_DIR, `${safeName}.json`);
                if (fs.existsSync(memFile)) fs.unlinkSync(memFile);
                return await message.reply('🗑️ Conversa limpa');
            }

            if (cmd === '/addkey') {
                let rawContent = budy.substring(budy.toLowerCase().indexOf('addkey') + 6).replace(/\s+/g, '');
                let prov = null;
                let key = rawContent;

                if (key.toLowerCase().startsWith('groq')) {
                    prov = 'groq';
                    key = key.substring(4);
                } else if (key.toLowerCase().startsWith('gemini')) {
                    prov = 'gemini';
                    key = key.substring(6);
                }

                if (key.startsWith('gsk_')) prov = 'groq';
                else if (key.startsWith('AIzaSy')) prov = 'gemini';
                else if (key.startsWith('sk-or-')) {
                    // OpenRouter key
                    if (!settings.openrouterKeys) settings.openrouterKeys = [];
                    if (!settings.openrouterKeys.includes(key)) {
                        settings.openrouterKeys.push(key);
                        settings.openrouterKey = settings.openrouterKeys[0];
                        salvarSettings();
                    }
                    return await message.reply(`✅ Chave OpenRouter adicionada! Total: ${settings.openrouterKeys.length} keys`);
                }

                if (prov && key) {
                    apiKeyManager.addKey(key, prov);
                    return await message.reply(`✅ Chave ${prov.toUpperCase()} identificada e adicionada com sucesso!`);
                }
                return await message.reply('Uso: /addkey [sua_chave]\n(O bot identifica sozinho se é Groq ou Gemini)');
            }
            
            return; // Ignora outros comandos com /
        }

        // Debounce e resposta
        const pendingKey = from;
        if (pendingMessages.has(pendingKey)) {
            const p = pendingMessages.get(pendingKey);
            p.messages.push(budy);
            clearTimeout(p.timer);
        } else {
            pendingMessages.set(pendingKey, { messages: [budy], timer: null });
        }

        const p = pendingMessages.get(pendingKey);
        p.timer = setTimeout(async () => {
            const fullText = p.messages.join('\n');
            pendingMessages.delete(pendingKey);
            
            try {
                try { await sock.sendMessage(from, { react: { text: '🧠', key: message.key } }); } catch {}
                await sock.sendPresenceUpdate('composing', from);
                const response = await callAI(from, pushname, fullText, isOwner);
                await sock.sendPresenceUpdate('paused', from);
                await sock.sendMessage(from, { text: response + '\u200B' }, { quoted: message });
                try { await sock.sendMessage(from, { react: { text: '', key: message.key } }); } catch {}
            } catch (e) { console.error(e); }
        }, 1500);

    } catch (err) { console.error(err); }
};
