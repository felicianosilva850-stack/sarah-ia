const chalk = require("chalk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const apiKeyManager = require("../apiKeyManager");
const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "..", "settings.json");

function getSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

// ══════════════════════════════════════════
//  GEMINI
// ══════════════════════════════════════════

async function executeGemini(history, prompt, tools, system) {
    const settings = getSettings();
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

// ══════════════════════════════════════════
//  GROQ
// ══════════════════════════════════════════

async function executeGroq(history, prompt, system, tools) {
    const settings = getSettings();
    let currentKey = apiKeyManager.getKey('groq');
    if (!currentKey) throw new Error("Sem chaves Groq configuradas.");

    let attempts = 0;
    const maxAttempts = apiKeyManager.listKeys('groq').length || 1;

    // Se o prompt já for um array (usado pra retornar resultados de tools), usamos ele direto. Senão, criamos o padrão.
    let messages = [{ role: "system", content: system }];
    if (Array.isArray(prompt)) {
        messages = messages.concat(prompt);
    } else {
        history.forEach(h => {
            messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts ? h.parts[0].text : h.content });
        });
        messages.push({ role: "user", content: prompt });
    }

    const reqConfig = {
        messages: messages,
        model: settings.groqModel || "llama-3.3-70b-versatile",
    };
    if (tools && tools.length > 0) {
        reqConfig.tools = tools.map(t => ({ type: "function", function: t.function }));
        reqConfig.tool_choice = "auto";
    }

    while (attempts < maxAttempts) {
        try {
            const groq = new Groq({ apiKey: currentKey });
            const chatCompletion = await groq.chat.completions.create(reqConfig);
            const msg = chatCompletion.choices[0].message;
            if (msg.tool_calls) {
                return { 
                    text: msg.content || "", 
                    functionCalls: msg.tool_calls.map(tc => ({ name: tc.function.name, args: JSON.parse(tc.function.arguments), id: tc.id })),
                    messages: messages.concat([msg]) 
                };
            }

            // Fallback manual caso o modelo Groq "vaze" a function pro texto em vez de usar a API oficial
            if (msg.content && msg.content.includes('<function')) {
                const match = msg.content.match(/<function[\/=](.*?)>(.*?)<\/function>/is);
                if (match) {
                    const funcName = match[1].trim();
                    let funcArgs = {};
                    try { funcArgs = JSON.parse(match[2].trim()); } catch(e){}
                    const callId = "call_" + Math.random().toString(36).substr(2,9);
                    
                    // Modifica a mensagem para ficar num formato válido pra API do Groq
                    msg.content = null;
                    msg.tool_calls = [{
                        id: callId,
                        type: "function",
                        function: { name: funcName, arguments: JSON.stringify(funcArgs) }
                    }];
                    
                    return {
                        text: "", // Removemos o texto vazado
                        functionCalls: [{ name: funcName, args: funcArgs, id: callId }],
                        messages: messages.concat([msg])
                    };
                }
            }

            return { text: msg.content || "" };
        } catch (e) {
            console.error(chalk.red("[DEBUG GROQ ERROR]:"), e.status, e.message);
            const status = e.status || (e.response && e.response.status);
            if (status === 401 || status === 403) {
                apiKeyManager.markFailure(currentKey, 'groq');
                currentKey = apiKeyManager.getKey('groq');
                attempts++;
            } else if (status === 429) {
                currentKey = apiKeyManager.getKey('groq');
                attempts++;
            } else {
                throw e;
            }
        }
    }
    throw new Error("Falha no Groq após rotação de chaves.");
}

// ══════════════════════════════════════════
//  OPENROUTER
// ══════════════════════════════════════════

let orKeyIndex = 0;

function getORKey() {
    const settings = getSettings();
    const keys = settings.openrouterKeys || [];
    if (keys.length === 0) return settings.openrouterKey || null;
    return keys[orKeyIndex % keys.length];
}

function rotateORKey() {
    const settings = getSettings();
    const keys = settings.openrouterKeys || [];
    if (keys.length <= 1) return false;
    orKeyIndex = (orKeyIndex + 1) % keys.length;
    console.log(chalk.yellow(`[⚡] OpenRouter key rotacionada: ${orKeyIndex + 1}/${keys.length}`));
    return true;
}

async function executeOpenRouter(history, prompt, system, tools, attempt = 0) {
    const settings = getSettings();
    const apiKey = getORKey();
    if (!apiKey) throw new Error("Sem chave OpenRouter configurada.");
    const maxKeys = (settings.openrouterKeys || []).length || 1;

    let messages = [{ role: "system", content: system }];
    if (Array.isArray(prompt)) {
        messages = messages.concat(prompt);
    } else {
        history.forEach(h => {
            messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts ? h.parts[0].text : h.content });
        });
        messages.push({ role: "user", content: prompt });
    }

    const reqConfig = {
        model: settings.openrouterModel || "google/gemini-2.5-flash",
        messages: messages,
    };
    if (tools && tools.length > 0) {
        reqConfig.tools = tools.map(t => ({ type: "function", function: t.function || t }));
        reqConfig.tool_choice = "auto";
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(reqConfig),
        });
        const data = await response.json();

        if (data.error) {
            const errMsg = data.error.message || JSON.stringify(data.error);
            if ((errMsg.includes("Rate limit") || errMsg.includes("rate_limit") || errMsg.includes("429")) && attempt < maxKeys - 1) {
                if (rotateORKey()) return executeOpenRouter(history, prompt, system, tools, attempt + 1);
            }
            throw new Error(errMsg);
        }

        const msg = data.choices[0].message;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            return {
                text: msg.content || "",
                functionCalls: msg.tool_calls.map(tc => ({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                    id: tc.id
                })),
                messages: messages.concat([msg])
            };
        }
        return { text: msg.content || "" };
    } catch (e) {
        console.error(chalk.red("[DEBUG OPENROUTER ERROR]:"), e.message);
        throw e;
    }
}

// ══════════════════════════════════════════
//  OLLAMA
// ══════════════════════════════════════════

async function executeOllama(history, prompt, system, tools) {
    const settings = getSettings();
    let messages = [{ role: 'system', content: system }];
    if (Array.isArray(prompt)) {
        messages = messages.concat(prompt);
    } else {
        history.forEach(h => {
            messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts ? h.parts[0].text : h.content });
        });
        messages.push({ role: 'user', content: prompt });
    }

    const reqConfig = {
        model: settings.ollamaModel || 'qwen:8b',
        messages: messages,
        stream: false
    };

    if (tools && tools.length > 0) {
        reqConfig.tools = tools.map(t => ({ type: 'function', function: t }));
    }

    const endpoint = settings.ollamaEndpoint || 'http://127.0.0.1:11434/api/chat';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqConfig)
        });
        if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);
        
        const data = await response.json();
        const msg = data.message;
        
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            return {
                text: msg.content || '',
                functionCalls: msg.tool_calls.map(tc => ({ name: tc.function.name, args: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments, id: 'call_' + Math.random().toString(36).substr(2,9) })),
                messages: messages.concat([msg])
            };
        }
        return { text: msg.content || '' };
    } catch (e) {
        console.error('[DEBUG OLLAMA ERROR]:', e);
        throw e;
    }
}

// ══════════════════════════════════════════
//  FUNÇÃO UNIFICADA
// ══════════════════════════════════════════

async function callProvider(provider, history, prompt, system, tools) {
    switch (provider) {
        case 'gemini':
            return executeGemini(history, prompt, tools, system);
        case 'groq':
            return executeGroq(history, prompt, system, tools);
        case 'openrouter':
            return executeOpenRouter(history, prompt, system, tools);
        case 'ollama':
            return executeOllama(history, prompt, system, tools);
        default:
            return executeGemini(history, prompt, tools, system);
    }
}

module.exports = {
    executeGemini,
    executeGroq,
    executeOpenRouter,
    executeOllama,
    callProvider
};
