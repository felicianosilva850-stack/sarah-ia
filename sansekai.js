const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType } = require("@whiskeysockets/baileys");
const fs = require("fs"), util = require("util"), chalk = require("chalk"), path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { exec } = require("child_process");
let setting = require("./key.json");
const apiKeyManager = require("./apiKeyManager");
let currentApiKey = apiKeyManager.getKey() || (setting.keys && setting.keys[0]) || "placeholder";

async function executeGeminiWithRotation(history, messageOrParts, tools, systemInstruction) {
    let attempts = 0;
    const numKeys = apiKeyManager.listKeys().length;
    const maxAttempts = numKeys > 0 ? numKeys : 1;
    
    while (attempts <= maxAttempts) {
        try {
            const genAI = new GoogleGenerativeAI(currentApiKey);
            const modelConfig = { model: "gemini-1.5-flash" };
            if (systemInstruction) modelConfig.systemInstruction = systemInstruction;
            if (tools && tools.length > 0) modelConfig.tools = [{ functionDeclarations: tools }];
            
            const model = genAI.getGenerativeModel(modelConfig);
            const chat = model.startChat({ history });
            const response = await chat.sendMessage(messageOrParts);
            return { chat, response };
        } catch (e) {
            const msg = String(e.message || e);
            if (msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('404')) {
                console.log(chalk.red(`[ERRO] Chave inválida Gemini. Removendo... ${(currentApiKey||"").slice(-4)}`));
                apiKeyManager.markFailure(currentApiKey);
                currentApiKey = apiKeyManager.getKey();
                if (!currentApiKey) throw new Error("Sem chaves válidas no sistema.");
                attempts++;
                continue;
            } 
            else if (msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests')) {
                console.log(chalk.yellow(`[RATE LIMIT 429] Limite atingido na chave Gemini ...${(currentApiKey||"").slice(-4)}. Rotacionando...`));
                currentApiKey = apiKeyManager.getKey();
                if (!currentApiKey) throw new Error("Sem chaves no sistema para rotacionar.");
                attempts++;
                continue;
            } 
            else {
                throw e;
            }
        }
    }
    throw new Error("Falha após rotacionar todas as chaves.");
}

function convertToolToGemini(openaiDef) {
    const fn = openaiDef.function;
    function convertType(prop) {
        const out = { ...prop };
        if (out.type) out.type = out.type.toUpperCase();
        if (out.properties) {
            for (const k in out.properties) {
                out.properties[k] = convertType(out.properties[k]);
            }
        }
        if (out.items) out.items = convertType(out.items);
        return out;
    }
    return {
        name: fn.name,
        description: fn.description,
        parameters: convertType(fn.parameters)
    };
}

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
let settings = { isPublic: true, owners: [] };
if (fs.existsSync(SETTINGS_FILE)) {
    try { 
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        settings = { ...settings, ...parsed };
    } catch (e) { }
}

let setupPin = null;
if (!settings.owners || settings.owners.length === 0) {
    setupPin = Math.floor(100000 + Math.random() * 900000).toString();
    setTimeout(() => {
        console.log(chalk.bgRed.white(`n[⚠️ SETUP NECESSÁRIO] Nenhum dono configurado no settings.json!`));
        console.log(chalk.yellow(`Envie a seguinte mensagem no WhatsApp do bot para se tornar o dono:\n`));
        console.log(chalk.green(`  /setup ${setupPin}\n`));
    }, 2000);
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
        let cortado = history.slice(-MAX_HISTORY);
        if (cortado.length > 0 && cortado[0].role === 'assistant') {
            cortado.shift();
        }
        history = cortado;
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
//  CARREGADOR DE SKILLS E CHAMADA À IA
// ══════════════════════════════════════════

const SKILLS_DIR = path.join(__dirname, "skills");
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR);

const loadedSkills = {};
const groqTools = [];
const recentSentTexts = new Set();

// Carrega todas as skills na inicialização
fs.readdirSync(SKILLS_DIR).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const skill = require(path.join(SKILLS_DIR, file));
            if (skill.definition && skill.execute) {
                loadedSkills[skill.definition.function.name] = skill;
                groqTools.push(skill.definition);
                console.log(chalk.green(`[SKILL] Carregada: ${skill.definition.function.name}`));
            }
        } catch (e) {
            console.error(chalk.red(`[ERRO SKILL] Falha ao carregar ${file}:`), e.message);
        }
    }
});

async function callAI(chatId, pushname, input, isOwner) {
    let history = getMemory(chatId);
    let systemPrompt = fs.readFileSync(SYSTEM_FILE, 'utf8');
    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    systemPrompt += `\n\n[SISTEMA]: A data e hora atual do servidor é ${agora}.`;

    const chatNotas = notas[chatId];
    if (chatNotas && chatNotas.length > 0) {
        systemPrompt += `\n\n[Notas sobre este chat]: ${chatNotas.join(' | ')}`;
    }

    if (history.length > MAX_HISTORY) {
        let cortado = history.slice(-MAX_HISTORY);
        if (cortado.length > 0 && cortado[0].role === 'assistant') {
            cortado.shift();
        }
        history = cortado;
    }

    // Converter history pro formato do Gemini
    const geminiHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    let geminiTools = [];
    if (isOwner && groqTools.length > 0) {
        geminiTools = groqTools.map(convertToolToGemini);
    }

    let finalResponse = "";
    const promptFormatado = `[De: ${pushname}] ${input}`;
    
    try {
        let { chat, response } = await executeGeminiWithRotation(geminiHistory, promptFormatado, geminiTools, systemPrompt);
        let result = response.response;
        
        const functionCalls = result.functionCalls && result.functionCalls();
        
        if (functionCalls && functionCalls.length > 0) {
            const functionResponses = [];
            
            for (const call of functionCalls) {
                const funcName = call.name;
                const skill = loadedSkills[funcName];
                
                if (skill) {
                    console.log(chalk.blue(`[⚙️ FERRAMENTA] Executando: ${funcName}`));
                    const res = await skill.execute(call.args, { chatId });
                    functionResponses.push({
                        functionResponse: {
                            name: funcName,
                            response: { result: String(res).substring(0, 4000) }
                        }
                    });
                } else {
                    functionResponses.push({
                        functionResponse: {
                            name: funcName,
                            response: { result: "Erro: Ferramenta não encontrada." }
                        }
                    });
                }
            }
            
            const toolResult = await executeGeminiWithRotation(chat.getHistory(), functionResponses, geminiTools, systemPrompt);
            result = toolResult.response.response;
        }

        finalResponse = result.text();
    } catch (e) {
        console.error(chalk.red("[ERRO] Gemini API:"), e);
        finalResponse = "Opa, deu um erro de conexão com a IA (Gemini). Fala de novo?";
    }

    if (!finalResponse) finalResponse = "Fiz o que pediu, mas não tenho texto pra responder.";

    history.push({ role: 'user', content: promptFormatado });
    history.push({ role: 'assistant', content: finalResponse });
    saveMemory(chatId, history);

    logEvent(`AI chamada | Chat: ${chatId} | User: ${pushname}`);

    return finalResponse;
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
        if (message.key.fromMe && recentSentTexts.has(budy.trim())) return;

        const pushname = message.pushName || "Usuário";
        const from = message.chat;

        const rawSender = message.sender || message.key?.participant || message.key?.remoteJid || "";
        const sender = rawSender.split('@')[0];

        if (setupPin && budy.trim() === `/setup ${setupPin}`) {
            settings.owners = [sender];
            salvarSettings();
            setupPin = null;
            await message.reply('👑 Privilégios de dono concedidos com sucesso! Você agora é o administrador deste bot.\n\nUse /addkey gsk_SUA_CHAVE para configurar a IA.');
            console.log(chalk.green(`[SETUP] Novo dono configurado: ${sender}`));
            return;
        }

        const isOwner = OWNERS.some(num => sender === num || sender.endsWith(num)) || (settings.owners && settings.owners.includes(sender)) || message.key.fromMe;
        const isAutorizado = settings.isPublic || isOwner || autorizados.includes(sender);

        const shortText = budy.length > 60 ? budy.substring(0, 60) + "..." : budy;
        console.log(`${chalk.yellow('[💬]')} ${chalk.cyan(pushname)} ${chalk.gray(`(${sender})`)}: ${chalk.white(shortText)}`);

        if (isOwner && budy.startsWith('/addkey ')) {
            const newKey = budy.replace('/addkey', '').trim();
            if (newKey) {
                const added = apiKeyManager.addKey(newKey);
                if (added) {
                    await message.reply('✅ Chave Groq adicionada com sucesso! O bot já pode usar a IA.');
                } else {
                    await message.reply('⚠️ Essa chave já existe ou é inválida.');
                }
            } else {
                await message.reply('Uso: /addkey gsk_SUA_CHAVE_AQUI');
            }
            return;
        }

        // ═══════════════════════════════
        //  MENSAGENS NORMAIS → IA
        // ═══════════════════════════════
        if (!isAutorizado) return;

        const isGroup = from.endsWith('@g.us');
        const myNumber = sock.user.id.split(':')[0];
        const myLid = sock.authState?.creds?.me?.lid?.split(':')[0] || "SEMLID";
        
        // Verificações de menção muito mais fortes (incluindo LID para grupos recentes)
        const isMentionedByTag = message.mentionedJid && message.mentionedJid.some(jid => jid.includes(myNumber) || jid.includes(myLid));
        const isMentionedByText = budy.includes('@' + myNumber);
        const isReplyToMe = message.quoted && message.quoted.sender && (message.quoted.sender.includes(myNumber) || message.quoted.sender.includes(myLid));
        
        const isMentioned = isMentionedByTag || isMentionedByText || isReplyToMe;
        const startsWithSarah = budy.toLowerCase().startsWith('sarah');

        let shouldReply = false;
        let textoLimpo = budy;

        if (isGroup) {
            // Em grupos: só responde se chamar pelo nome, marcar ou responder a ela
            if (startsWithSarah || isMentioned) {
                shouldReply = true;
                if (startsWithSarah) textoLimpo = budy.replace(/^sarah\s*/i, '').trim() || "oi";
                // Limpa a menção por arroba do texto pra IA não ficar confusa
                textoLimpo = textoLimpo.replace(new RegExp(`@${myNumber}`, 'g'), '').trim() || textoLimpo;
            }
        } else {
            // Em DM: responde sempre
            shouldReply = true;
            if (startsWithSarah) textoLimpo = budy.replace(/^sarah\s*/i, '').trim() || "oi";
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

                const resposta = await callAI(from, pending.pushname, textoFinal, isOwner);
                recentSentTexts.add(resposta.trim());
                setTimeout(() => recentSentTexts.delete(resposta.trim()), 60000);
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
                    const fallbackRes = await executeGeminiWithRotation(
    [], 
    `[De: ${pending.pushname}] ${textoFinal}`, 
    [], 
    "Você é a Sarah. Responda brevemente em português."
);
                    const fallbackTexto = fallbackRes.response.response.text();
                    recentSentTexts.add(fallbackTexto.trim());
                    setTimeout(() => recentSentTexts.delete(fallbackTexto.trim()), 60000);
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

