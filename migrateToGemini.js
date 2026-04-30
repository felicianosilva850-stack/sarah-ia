const fs = require('fs');
let c = fs.readFileSync('sansekai.js', 'utf8');

// 1. Imports
c = c.replace('const fs = require("fs"), util = require("util"), chalk = require("chalk"), Groq = require("groq-sdk");', 
'const fs = require("fs"), util = require("util"), chalk = require("chalk");\nconst { GoogleGenerativeAI } = require("@google/generative-ai");');

// 2. Remove Groq setup & apiKeyManager Groq references
c = c.replace(/let currentApiKey = apiKeyManager\.getKey\(\) \|\| setting\.keyopenai;\r?\nlet groq = new Groq\(\{ apiKey: currentApiKey \|\| "placeholder" \}\);\r?\n\r?\nasync function executeGroqWithRotation\(payload\) \{[\s\S]*?\/\/ ══════════════════════════════════════════/m,
`let currentApiKey = apiKeyManager.getKey() || (setting.keys && setting.keys[0]) || "placeholder";

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
            if (msg.includes('401') || msg.includes('API_KEY_INVALID')) {
                console.log(chalk.red(\`[ERRO] Chave inválida Gemini. Removendo... \${(currentApiKey||"").slice(-4)}\`));
                apiKeyManager.markFailure(currentApiKey);
                currentApiKey = apiKeyManager.getKey();
                if (!currentApiKey) throw new Error("Sem chaves válidas no sistema.");
                attempts++;
                continue;
            } 
            else if (msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests')) {
                console.log(chalk.yellow(\`[RATE LIMIT 429] Limite atingido na chave Gemini ...\${(currentApiKey||"").slice(-4)}. Rotacionando...\`));
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

// ══════════════════════════════════════════`);

// 3. Rewrite callAI
const callAIRegex = /async function callAI\(chatId, pushname, input, isOwner\) \{[\s\S]*?return finalResponse;\r?\n\}/m;

const newCallAI = `async function callAI(chatId, pushname, input, isOwner) {
    let history = getMemory(chatId);
    let systemPrompt = fs.readFileSync(SYSTEM_FILE, 'utf8');
    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    systemPrompt += \`\\n\\n[SISTEMA]: A data e hora atual do servidor é \${agora}.\`;

    const chatNotas = notas[chatId];
    if (chatNotas && chatNotas.length > 0) {
        systemPrompt += \`\\n\\n[Notas sobre este chat]: \${chatNotas.join(' | ')}\`;
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
    const promptFormatado = \`[De: \${pushname}] \${input}\`;
    
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
                    console.log(chalk.blue(\`[⚙️ FERRAMENTA] Executando: \${funcName}\`));
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

    logEvent(\`AI chamada | Chat: \${chatId} | User: \${pushname}\`);

    return finalResponse;
}`;

c = c.replace(callAIRegex, newCallAI);

// 4. Update the fallback model in the upsert catch block
c = c.replace(/const fallbackRes = await executeGroqWithRotation\(\{[\s\S]*?\}\);/g, 
`const fallbackRes = await executeGeminiWithRotation(
    [], 
    \`[De: \${pending.pushname}] \${textoFinal}\`, 
    [], 
    "Você é a Sarah. Responda brevemente em português."
);`);
c = c.replace(/const fallbackTexto = fallbackRes\.choices\[0\]\.message\.content;/g, 
`const fallbackTexto = fallbackRes.response.response.text();`);

fs.writeFileSync('sansekai.js', c, 'utf8');
