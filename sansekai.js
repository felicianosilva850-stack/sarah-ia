const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType } = require("@whiskeysockets/baileys");
const fs = require("fs"), util = require("util"), chalk = require("chalk"), Groq = require("groq-sdk");
let setting = require("./key.json");
const groq = new Groq({ apiKey: setting.keyopenai });
const path = require("path");

// ══════════════════════════════════════════
//        ARQUITETURA MODULAR
// ══════════════════════════════════════════

// Diretórios
const MEMORY_DIR = path.join(__dirname, "memory");
const LEARNINGS_DIR = path.join(__dirname, "learnings");
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);
if (!fs.existsSync(LEARNINGS_DIR)) fs.mkdirSync(LEARNINGS_DIR);

// Arquivos core
const SYSTEM_FILE = path.join(__dirname, "SYSTEM.md");
const AUTORIZADOS_FILE = path.join(__dirname, "autorizados.json");
const NOTAS_FILE = path.join(__dirname, "notas.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

// Carregar settings
let settings = { isPublic: true };
if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { }
}
const salvarSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// Carregar autorizados
let autorizados = [];
if (fs.existsSync(AUTORIZADOS_FILE)) {
    autorizados = JSON.parse(fs.readFileSync(AUTORIZADOS_FILE, 'utf8'));
}
const salvarAutorizados = () => fs.writeFileSync(AUTORIZADOS_FILE, JSON.stringify(autorizados, null, 2));

// Notas/lembretes persistentes
let notas = {};
if (fs.existsSync(NOTAS_FILE)) {
    notas = JSON.parse(fs.readFileSync(NOTAS_FILE, 'utf8'));
}
const salvarNotas = () => fs.writeFileSync(NOTAS_FILE, JSON.stringify(notas, null, 2));

// Donos (Luan + Davy + Novos LIDs)
const OWNERS = ["557186611701", "5571986611701", "559491855060", "5594991855060", "236949688311960", "101679106150440"];


const DEBOUNCE_MS = 1500;
const pendingMessages = new Map(); // chatId -> { messages: [], timer, message }

// ══════════════════════════════════════════
//  MEMÓRIA ISOLADA POR CHAT (SQLite-like em JSON)
// ══════════════════════════════════════════
const MAX_HISTORY = 30; // Manter últimas 30 mensagens por chat

function getMemory(chatId) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch { return []; }
    }
    return [];
}

function saveMemory(chatId, history) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    // Auto-trim: manter só as últimas MAX_HISTORY mensagens
    if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
    }
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
}


function logError(context, error) {
    const logFile = path.join(LEARNINGS_DIR, "errors.log");
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${context}: ${error?.message || error}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(chalk.red(`[ERRO] ${context}:`), error?.message || error);
}

function logEvent(event) {
    const logFile = path.join(LEARNINGS_DIR, "events.log");
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${event}\n`);
}

// ══════════════════════════════════════════
//  CHAMADA À IA — GROQ (llama 3.3 70B)
// ══════════════════════════════════════════
async function callAI(chatId, pushname, input) {
    let history = getMemory(chatId);
    const systemPrompt = fs.readFileSync(SYSTEM_FILE, 'utf8');

    // Montar contexto
    let messages = [{ role: 'system', content: systemPrompt }];

    // Adicionar notas/contexto persistente se existir para este chat
    const chatNotas = notas[chatId];
    if (chatNotas && chatNotas.length > 0) {
        messages.push({
            role: 'system',
            content: `[Notas sobre este chat]: ${chatNotas.join(' | ')}`
        });
    }

    messages = messages.concat(history);
    messages.push({ role: 'user', content: `[De: ${pushname}] ${input}` });

    // Limitar contexto pra não estourar tokens
    if (messages.length > MAX_HISTORY + 3) {
        history = history.slice(-(MAX_HISTORY));
        messages = [{ role: 'system', content: systemPrompt }].concat(history);
        messages.push({ role: 'user', content: `[De: ${pushname}] ${input}` });
    }

    const res = await groq.chat.completions.create({
        messages: messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.75,
        max_tokens: 1024,
        top_p: 0.9,
        frequency_penalty: 0.3 // Evita repetição
    });

    const resposta = res.choices[0].message.content;

    // Salvar na memória isolada
    history.push({ role: 'user', content: `[De: ${pushname}] ${input}` });
    history.push({ role: 'assistant', content: resposta });
    saveMemory(chatId, history);

    // Log de uso
    const tokens = res.usage?.total_tokens || 0;
    logEvent(`AI chamada | Chat: ${chatId} | Tokens: ${tokens} | User: ${pushname}`);

    return resposta;
}

// ══════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════
module.exports = sansekai = async (upsert, sock, store, message) => {
    try {
        // Ignorar se não tem mensagem (notificações, reações, etc)
        if (!message.message) return;

        let budy = (typeof message.text == 'string' ? message.text : '');
        if (!budy) return;

        // Se a mensagem contiver a marca d'água invisível, foi enviada pelo próprio bot. Ignorar para evitar loop.
        if (budy.includes('\u200B')) return;

        var prefix = /^[\\/!#.]/gi.test(budy) ? budy.match(/^[\\/!#.]/gi) : "/";
        const isCmd = budy.startsWith(prefix);
        const command = isCmd ? budy.replace(prefix, "").trim().split(/ +/).shift().toLowerCase() : "";
        const args = budy.trim().split(/ +/).slice(1);
        const pushname = message.pushName || "Usuário";
        const from = message.chat;

        // Extrair número real do remetente (usando o sender já normalizado pelo lib/messages.js)
        const rawSender = message.sender || message.key?.participant || message.key?.remoteJid || "";
        const sender = rawSender.split('@')[0];

        // Verificação de dono (só pra comandos admin)
        const isOwner = OWNERS.some(num => sender.includes(num) || num.includes(sender));
        const isAutorizado = settings.isPublic || isOwner || autorizados.includes(sender);

        const shortText = budy.length > 60 ? budy.substring(0, 60) + "..." : budy;
        console.log(`${chalk.yellow('[💬]')} ${chalk.cyan(pushname)} ${chalk.gray(`(${sender})`)}: ${chalk.white(shortText)}`);

        let text = args.join(" ");

        // ═══════════════════════════════
        //  COMANDOS (prefixo /)
        // ═══════════════════════════════
        if (isCmd) {
            switch (command) {
                case "publico":
                    if (!isOwner) return message.reply('negado.');
                    if (text === "on") {
                        settings.isPublic = true;
                        salvarSettings();
                        message.reply('Modo p�blico ATIVADO. Respondendo a qualquer pessoa.');
                    } else if (text === "off") {
                        settings.isPublic = false;
                        salvarSettings();
                        message.reply('Modo p�blico DESATIVADO. Somente autorizados.');
                    } else {
                        message.reply('Uso: /publico on ou /publico off (Atual: ' + (settings.isPublic ? 'ATIVADO' : 'DESATIVADO') + ')');
                    }
                    break;
                case "autorizar":
                    if (!isOwner) return message.reply('negado. só o luan manda aqui');
                    if (!text) return message.reply('uso: /autorizar 5511...');
                    let numAdd = text.replace(/\D/g, '');
                    if (!autorizados.includes(numAdd)) {
                        autorizados.push(numAdd);
                        salvarAutorizados();
                        message.reply(`pronto, ${numAdd} tá autorizado`);
                    } else {
                        message.reply('esse número já tava na lista');
                    }
                    break;

                case "remover":
                    if (!isOwner) return message.reply('negado');
                    let numRem = text.replace(/\D/g, '');
                    autorizados = autorizados.filter(n => n !== numRem);
                    salvarAutorizados();
                    message.reply(`${numRem} removido da lista`);
                    break;

                case "limpar":
                    if (!isOwner) return message.reply('negado');
                    const memFile = path.join(MEMORY_DIR, `${from.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`);
                    if (fs.existsSync(memFile)) fs.unlinkSync(memFile);
                    if (notas[from]) { delete notas[from]; salvarNotas(); }
                    message.reply('memória deste chat apagada, contexto zerado');
                    break;

                case "nota":
                    if (!isOwner) return message.reply('negado');
                    if (!text) return message.reply('uso: /nota texto da nota');
                    if (!notas[from]) notas[from] = [];
                    notas[from].push(text);
                    salvarNotas();
                    message.reply(`anotado`);
                    break;

                case "notas":
                    if (!isOwner) return message.reply('negado');
                    const chatNotas = notas[from] || [];
                    if (chatNotas.length === 0) return message.reply('nenhuma nota nesse chat');
                    message.reply(`notas desse chat:\n${chatNotas.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
                    break;

                case "delnota":
                    if (!isOwner) return message.reply('negado');
                    const idx = parseInt(text) - 1;
                    if (!notas[from] || !notas[from][idx]) return message.reply('nota não encontrada');
                    notas[from].splice(idx, 1);
                    salvarNotas();
                    message.reply('nota removida');
                    break;

                case "status":
                    if (!isOwner) return;
                    const memFiles = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
                    const totalMem = memFiles.reduce((acc, f) => {
                        try { return acc + JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8')).length; }
                        catch { return acc; }
                    }, 0);
                    message.reply(
                        `logan status:\n` +
                        `chats ativos: ${memFiles.length}\n` +
                        `mensagens na memória: ${totalMem}\n` +
                        `autorizados: ${autorizados.length}\n` +
                        `notas salvas: ${Object.values(notas).flat().length}`
                    );
                    break;

                case "sistema":
                    if (!isOwner) return message.reply('negado');
                    if (!text) {
                        const current = fs.readFileSync(SYSTEM_FILE, 'utf8');
                        return message.reply(`system prompt atual (${current.length} chars):\n\n${current.substring(0, 500)}...`);
                    }
                    // Append ao system prompt
                    const currentSystem = fs.readFileSync(SYSTEM_FILE, 'utf8');
                    fs.writeFileSync(SYSTEM_FILE, currentSystem + '\n\n## Instrução adicional\n' + text);
                    message.reply('instrução adicionada ao sistema');
                    break;

                case "ping":
                    const start = Date.now();
                    await message.reply('pong');
                    break;

                case "help":
                case "menu":
                    message.reply(
                        `logan ai — comandos:\n\n` +
                        `/autorizar [num] — liberar número\n` +
                        `/remover [num] — revogar acesso\n` +
                        `/limpar — zerar memória do chat\n` +
                        `/nota [texto] — salvar nota no chat\n` +
                        `/notas — ver notas do chat\n` +
                        `/delnota [n] — apagar nota\n` +
                        `/status — status do bot\n` +
                        `/sistema — ver/editar system prompt\n` +
                        `/ping — testar latência\n` +
                        `/todos — marcar todos (grupo)`
                    );
                    break;

                case "todos":
                case "totag": {
                    if (!from.endsWith('@g.us')) return message.reply('só funciona em grupo');
                    try {
                        const groupMeta = await sock.groupMetadata(from);
                        const participants = groupMeta.participants;
                        let mentions = participants.map(p => p.id);
                        let mentionText = text || "📢";
                        await sock.sendMessage(from, {
                            text: mentionText,
                            mentions: mentions
                        }, { quoted: message });
                    } catch (e) {
                        logError("totag", e);
                        message.reply('não consegui marcar todo mundo');
                    }
                    break;
                }
            }
            return; // Comandos não ativam a IA
        }

        // ═══════════════════════════════
        //  MENSAGENS NORMAIS → IA
        // ═══════════════════════════════
        if (!isAutorizado) return;

        const isGroup = from.endsWith('@g.us');
        const myNumber = sock.user.id.split(':')[0];
        const isMentioned = message.mentionMe || budy.toLowerCase().includes('@' + myNumber);
        const startsWithLogan = budy.toLowerCase().startsWith('logan');

        let shouldReply = false;
        let textoLimpo = budy;

        if (isGroup) {
            // Em grupos: só responde se chamar pelo nome ou marcar
            if (startsWithLogan || isMentioned) {
                shouldReply = true;
                if (startsWithLogan) textoLimpo = budy.replace(/^logan\s*/i, '').trim() || "oi";
            }
        } else {
            // Em DM: responde sempre
            shouldReply = true;
            if (startsWithLogan) textoLimpo = budy.replace(/^logan\s*/i, '').trim() || "oi";
        }

        if (!shouldReply || textoLimpo.length === 0) return;

        // ═══════════════════════════════
        //  DEBOUNCE — Agrupa msgs rápidas
        //  Espera 1.5s após última msg antes de responder
        // ═══════════════════════════════
        const pendingKey = `${from}:${sender}`;

        if (pendingMessages.has(pendingKey)) {
            const pending = pendingMessages.get(pendingKey);
            pending.messages.push(textoLimpo);
            pending.pushname = pushname;
            pending.msgRef = message; // Atualizar referência pra responder à última
            clearTimeout(pending.timer);
        } else {
            pendingMessages.set(pendingKey, {
                messages: [textoLimpo],
                pushname: pushname,
                msgRef: message
            });
        }

        const pending = pendingMessages.get(pendingKey);
        pending.timer = setTimeout(async () => {
            pendingMessages.delete(pendingKey);

            // Juntar todas as mensagens acumuladas
            const textoFinal = pending.messages.join('\n');

            try {
                // React com emoji de "pensando" 
                try {
                    await sock.sendMessage(from, {
                        react: { text: '🧠', key: pending.msgRef.key }
                    });
                } catch { }

                const resposta = await callAI(from, pending.pushname, textoFinal);
                await sock.sendMessage(from, { text: resposta + '\u200B' }, { quoted: pending.msgRef });

                // Remover react
                try {
                    await sock.sendMessage(from, {
                        react: { text: '', key: pending.msgRef.key }
                    });
                } catch { }

            } catch (e) {
                logError(`AI response (${from})`, e);
                // Tentar com modelo fallback
                try {
                    const fallbackRes = await groq.chat.completions.create({
                        messages: [
                            { role: 'system', content: 'você é o logan, responda brevemente e naturalmente em português' },
                            { role: 'user', content: textoFinal }
                        ],
                        model: 'llama-3.1-8b-instant',
                        temperature: 0.7,
                        max_tokens: 256
                    });
                    const fallbackTexto = fallbackRes.choices[0].message.content;
                    await sock.sendMessage(from, { text: fallbackTexto + '\u200B' }, { quoted: pending.msgRef });
                } catch (e2) {
                    logError("AI fallback", e2);
                }
            }
        }, DEBOUNCE_MS);

    } catch (err) {
        logError("handler geral", err);
    }
};

