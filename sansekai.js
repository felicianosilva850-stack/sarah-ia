const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType } = require("@whiskeysockets/baileys");
const fs = require("fs"), util = require("util"), chalk = require("chalk"), path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const { exec } = require("child_process");
const apiKeyManager = require("./apiKeyManager");

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
let settings = { 
    isPublic: true, 
    owners: [], 
    provider: "gemini", // padrão
    groqModel: "llama-3.1-8b-instant",
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
//  EXECUÇÃO DE IA (GEMINI / GROQ)
// ══════════════════════════════════════════

async function executeGemini(history, prompt, tools, system) {
    let currentKey = apiKeyManager.getKey('gemini');
    if (!currentKey) throw new Error("Sem chaves Gemini configuradas.");

    let attempts = 0;
    const maxAttempts = apiKeyManager.listKeys('gemini').length || 1;

    while (attempts < maxAttempts) {
        try {
            const genAI = new GoogleGenerativeAI(currentKey);
            const modelConfig = { model: settings.geminiModel || "gemini-1.5-flash" };
            if (system) modelConfig.systemInstruction = system;
            if (tools && tools.length > 0) modelConfig.tools = [{ functionDeclarations: tools }];

            const model = genAI.getGenerativeModel(modelConfig);
            const chat = model.startChat({ history });
            const response = await chat.sendMessage(prompt);
            return { text: response.response.text(), functionCalls: response.response.functionCalls && response.response.functionCalls(), chat };
        } catch (e) {
            const msg = String(e.message || e);
            if (msg.includes('401') || msg.includes('API_KEY_INVALID')) {
                apiKeyManager.markFailure(currentKey, 'gemini');
                currentKey = apiKeyManager.getKey('gemini');
                attempts++;
            } else if (msg.includes('429') || msg.includes('quota')) {
                currentKey = apiKeyManager.getKey('gemini');
                attempts++;
            } else throw e;
        }
    }
    throw new Error("Falha no Gemini após rotação.");
}

async function executeGroq(history, prompt, system) {
    let currentKey = apiKeyManager.getKey('groq');
    if (!currentKey) throw new Error("Sem chaves Groq configuradas.");

    const groq = new Groq({ apiKey: currentKey });
    const messages = [{ role: "system", content: system }];
    
    // Converter history pro formato Groq/OpenAI
    history.forEach(h => {
        messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text });
    });
    messages.push({ role: "user", content: prompt });

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: settings.groqModel || "llama-3.1-8b-instant",
        });
        return { text: chatCompletion.choices[0].message.content };
    } catch (e) {
        if (e.status === 401) apiKeyManager.markFailure(currentKey, 'groq');
        throw e;
    }
}

// ══════════════════════════════════════════
//  FUNÇÕES AUXILIARES E SKILLS
// ══════════════════════════════════════════

function convertToolToGemini(openaiDef) {
    const fn = openaiDef.function;
    function convertType(prop) {
        const out = { ...prop };
        if (out.type) out.type = out.type.toUpperCase();
        if (out.properties) {
            for (const k in out.properties) out.properties[k] = convertType(out.properties[k]);
        }
        if (out.items) out.items = convertType(out.items);
        return out;
    }
    return { name: fn.name, description: fn.description, parameters: convertType(fn.parameters) };
}

const loadedSkills = {};
const groqTools = [];
const SKILLS_DIR = path.join(__dirname, "skills");
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR);

fs.readdirSync(SKILLS_DIR).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const skill = require(path.join(SKILLS_DIR, file));
            if (skill.definition && skill.execute) {
                loadedSkills[skill.definition.function.name] = skill;
                groqTools.push(skill.definition);
            }
        } catch (e) {}
    }
});

// ══════════════════════════════════════════
//  MEMÓRIA E LOGS
// ══════════════════════════════════════════

function getMemory(chatId) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    if (fs.existsSync(file)) try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
    return [];
}

function saveMemory(chatId, history) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    if (history.length > 20) history = history.slice(-20);
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
}

// ══════════════════════════════════════════
//  LÓGICA PRINCIPAL DE CHAMADA
// ══════════════════════════════════════════

async function callAI(chatId, pushname, input, isOwner) {
    let history = getMemory(chatId);
    let systemPrompt = fs.readFileSync(SYSTEM_FILE, 'utf8');
    const geminiHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    const promptFormatado = `[De: ${pushname}] ${input}`;
    let finalResponse = "";

    try {
        if (settings.provider === "groq") {
            const res = await executeGroq(geminiHistory, promptFormatado, systemPrompt);
            finalResponse = res.text;
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
        const isOwner = ["559491855060"].includes(sender) || message.key.fromMe; // Simplificado

        // Comandos de Admin
        if (isOwner && budy.startsWith('/')) {
            const args = budy.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/provider') {
                const p = args[1]?.toLowerCase();
                if (['gemini', 'groq'].includes(p)) {
                    settings.provider = p;
                    salvarSettings();
                    return await message.reply(`✅ Provedor alterado para: ${p}`);
                }
                return await message.reply('Uso: /provider [gemini|groq]');
            }

            if (cmd === '/addkey') {
                const prov = args[1]?.toLowerCase();
                const key = args[2];
                if (['gemini', 'groq'].includes(prov) && key) {
                    apiKeyManager.addKey(key, prov);
                    return await message.reply(`✅ Chave ${prov} adicionada!`);
                }
                return await message.reply('Uso: /addkey [gemini|groq] [chave]');
            }
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
                const response = await callAI(from, pushname, fullText, isOwner);
                await sock.sendMessage(from, { text: response + '\u200B' }, { quoted: message });
            } catch (e) { console.error(e); }
        }, 1500);

    } catch (err) { console.error(err); }
};