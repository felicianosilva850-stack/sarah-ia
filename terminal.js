const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { exec } = require("child_process");

const SETTINGS_FILE = path.join(__dirname, "settings.json");
const SYSTEM_FILE = path.join(__dirname, "SYSTEM.md");
const MEMORY_DIR = path.join(__dirname, "memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "terminal.json");

let settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
const systemPrompt = fs.readFileSync(SYSTEM_FILE, "utf8");

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
};

function getHistory() {
    if (fs.existsSync(MEMORY_FILE)) {
        try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch { return []; }
    }
    return [];
}

function saveHistory(history) {
    if (history.length > 30) history = history.slice(-30);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(history, null, 2));
}

function getTime() {
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function runCommand(cmd) {
    return new Promise((resolve) => {
        exec(cmd, { encoding: "utf8", timeout: 15000, shell: "powershell.exe" }, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout.trim() || "(comando executado)" });
            }
        });
    });
}

const tools = [
    {
        type: "function",
        function: {
            name: "executar_comando",
            description: "Executa um comando no terminal PowerShell do computador. Use para abrir programas, criar arquivos, verificar informacoes do sistema, etc.",
            parameters: {
                type: "object",
                properties: {
                    comando: {
                        type: "string",
                        description: "O comando PowerShell a ser executado. Ex: 'Start-Process chrome', 'Get-Date', 'dir'"
                    }
                },
                required: ["comando"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "abrir_site",
            description: "Abre um site no navegador padrao",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "URL do site a abrir. Ex: 'https://google.com'"
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "ler_arquivo",
            description: "Le o conteudo de um arquivo no computador",
            parameters: {
                type: "object",
                properties: {
                    caminho: {
                        type: "string",
                        description: "Caminho do arquivo. Ex: 'C:\\Users\\davyf22l\\Desktop\\notas.txt'"
                    }
                },
                required: ["caminho"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "escrever_arquivo",
            description: "Cria ou sobrescreve um arquivo com o conteudo fornecido",
            parameters: {
                type: "object",
                properties: {
                    caminho: {
                        type: "string",
                        description: "Caminho do arquivo"
                    },
                    conteudo: {
                        type: "string",
                        description: "Conteudo a escrever no arquivo"
                    }
                },
                required: ["caminho", "conteudo"]
            }
        }
    }
];

async function executeTool(name, args) {
    switch (name) {
        case "executar_comando":
            const res = await runCommand(args.comando);
            console.log(`\r${" ".repeat(30)}\r${c.gray}> ${args.comando}${c.reset}`);
            if (res.output && res.output !== "(comando executado)") {
                console.log(`${c.gray}${res.output.substring(0, 500)}${c.reset}`);
            }
            return res.output.substring(0, 2000);
        case "abrir_site":
            await runCommand(`Start-Process "${args.url}"`);
            console.log(`\r${" ".repeat(30)}\r${c.gray}> abrindo ${args.url}${c.reset}`);
            return `site ${args.url} aberto com sucesso`;
        case "ler_arquivo":
            try {
                const content = fs.readFileSync(args.caminho, "utf8").substring(0, 3000);
                console.log(`\r${" ".repeat(30)}\r${c.gray}> lendo ${args.caminho}${c.reset}`);
                return content;
            } catch (e) {
                return `erro ao ler: ${e.message}`;
            }
        case "escrever_arquivo":
            try {
                fs.writeFileSync(args.caminho, args.conteudo, "utf8");
                console.log(`\r${" ".repeat(30)}\r${c.gray}> escrevendo ${args.caminho}${c.reset}`);
                return `arquivo salvo com sucesso em ${args.caminho}`;
            } catch (e) {
                return `erro ao escrever: ${e.message}`;
            }
        default:
            return "tool desconhecida";
    }
}

let currentKeyIndex = 0;

function getApiKey() {
    const keys = settings.openrouterKeys || [];
    if (keys.length === 0) {
        // fallback pra key antiga
        if (settings.openrouterKey) return settings.openrouterKey;
        return null;
    }
    return keys[currentKeyIndex % keys.length];
}

function rotateKey() {
    const keys = settings.openrouterKeys || [];
    if (keys.length <= 1) return false;
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    console.log(`${c.yellow}⚡ key ${currentKeyIndex + 1}/${keys.length} ativada${c.reset}`);
    return true;
}

async function callOpenRouter(history, userMsg, attempt = 0) {
    const apiKey = getApiKey();
    if (!apiKey) { console.log(`${c.red}[ERRO] Sem chave OpenRouter no settings.json${c.reset}`); process.exit(1); }

    const maxKeys = (settings.openrouterKeys || []).length || 1;

    const timeInfo = `\n\nData e hora atual: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\nVoce tem acesso ao computador do usuario atraves de ferramentas (tools). Pode executar comandos, abrir sites, ler e escrever arquivos. Use as tools quando o usuario pedir algo que envolva o computador.\nDicas de comandos:\n- Abrir pasta: explorer.exe "C:\\caminho\\da\\pasta"\n- Abrir programa: Start-Process nome_do_programa\n- Listar arquivos: Get-ChildItem "caminho"\n- Informacoes do sistema: Get-ComputerInfo\nSempre use a tool executar_comando para ações no PC. Depois de executar, diga ao usuario o que aconteceu baseado no resultado retornado.`;

    let messages = [{ role: "system", content: systemPrompt + timeInfo }];
    history.forEach(h => messages.push({ role: h.role, content: h.content }));
    messages.push({ role: "user", content: userMsg });

    const reqBody = {
        model: settings.openrouterModel || "google/gemini-2.5-flash",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
    };

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
    });

    const data = await res.json();

    if (data.error) {
        const errMsg = data.error.message || JSON.stringify(data.error);
        // se for rate limit e tem mais keys, rotaciona
        if ((errMsg.includes("Rate limit") || errMsg.includes("rate_limit") || errMsg.includes("429")) && attempt < maxKeys - 1) {
            const rotated = rotateKey();
            if (rotated) {
                return callOpenRouter(history, userMsg, attempt + 1);
            }
        }
        throw new Error(errMsg);
    }

    const msg = data.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolResults = [];
        for (const tc of msg.tool_calls) {
            const fnName = tc.function.name;
            let fnArgs;
            try { fnArgs = JSON.parse(tc.function.arguments); } catch { fnArgs = {}; }

            console.log(`\r${" ".repeat(30)}\r${c.yellow}⚡ executando: ${fnName}${c.reset}`);
            const result = await executeTool(fnName, fnArgs);

            toolResults.push({
                tool_call_id: tc.id,
                role: "tool",
                content: result,
            });
        }

        messages.push(msg);
        messages = messages.concat(toolResults);

        process.stdout.write(`${c.gray}Sarah processando...${c.reset}`);

        const res2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${getApiKey()}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: settings.openrouterModel || "google/gemini-2.5-flash",
                messages: messages,
            }),
        });

        const data2 = await res2.json();
        if (data2.error) throw new Error(data2.error.message || JSON.stringify(data2.error));

        const resposta = data2.choices[0].message.content || "";
        const usage = data2.usage || {};
        return { resposta, tokens: usage.total_tokens || "?" };
    }

    const resposta = msg.content || "";
    const usage = data.usage || {};
    return { resposta, tokens: usage.total_tokens || "?" };
}

function showHeader() {
    const modelo = settings.openrouterModel || "google/gemini-2.5-flash";
    console.clear();
    console.log(`
  ${c.magenta}${c.bold}╔════════════════════════════════════════════╗
  ║${c.reset}        ${c.cyan}${c.bold}✦  SARAH  ✦${c.reset}  ${c.gray}Chat Terminal${c.reset}       ${c.magenta}${c.bold}║
  ╠════════════════════════════════════════════╣
  ║${c.reset}  ${c.gray}Modelo:${c.reset} ${c.white}${modelo.padEnd(34).substring(0,34)}${c.reset} ${c.magenta}${c.bold}║
  ║${c.reset}  ${c.dim}sair${c.reset} ${c.gray}fechar${c.reset}  ${c.dim}limpar${c.reset} ${c.gray}resetar${c.reset}  ${c.dim}modelo${c.reset} ${c.gray}trocar${c.reset}  ${c.magenta}${c.bold}║
  ╚════════════════════════════════════════════╝${c.reset}
`);
}

async function main() {
    showHeader();

    let history = getHistory();
    if (history.length > 0) {
        console.log(`${c.yellow}  ⚡ ${history.length} mensagens no historico${c.reset}\n`);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const pergunta = () => {
        rl.question(`${c.cyan}${c.bold}Voce > ${c.reset}`, async (input) => {
            input = input.trim();
            if (!input) return pergunta();

            if (input.toLowerCase() === "sair") {
                console.log(`${c.magenta}${c.bold}Sarah:${c.reset} ${c.white}flw, ate mais${c.reset}\n`);
                rl.close();
                return;
            }

            if (input.toLowerCase() === "limpar" || input.toLowerCase() === "/reset") {
                history = [];
                saveHistory(history);
                console.log(`${c.yellow}⚡ historico limpo${c.reset}\n`);
                return pergunta();
            }

            if (input.toLowerCase().startsWith("/addkey ")) {
                const key = input.substring(8).trim();
                if (!key) {
                    console.log(`${c.red}✕ uso: /addkey sk-or-v1-xxx${c.reset}\n`);
                    return pergunta();
                }
                if (!settings.openrouterKeys) settings.openrouterKeys = [];
                if (settings.openrouterKeys.includes(key)) {
                    console.log(`${c.yellow}⚡ essa key ja ta na lista${c.reset}\n`);
                } else {
                    settings.openrouterKeys.push(key);
                    settings.openrouterKey = settings.openrouterKeys[0];
                    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
                    console.log(`${c.green}✓ key adicionada! total: ${settings.openrouterKeys.length} keys${c.reset}\n`);
                }
                return pergunta();
            }

            if (input.toLowerCase() === "/keys") {
                const keys = settings.openrouterKeys || [];
                if (keys.length === 0) {
                    console.log(`${c.yellow}nenhuma key cadastrada${c.reset}\n`);
                } else {
                    console.log(`${c.cyan}${c.bold}Keys OpenRouter (${keys.length}):${c.reset}`);
                    keys.forEach((k, i) => {
                        const active = i === currentKeyIndex ? ` ${c.green}<- ativa${c.reset}` : "";
                        console.log(`  ${c.gray}${i + 1}. ${k.substring(0, 15)}...${k.substring(k.length - 6)}${c.reset}${active}`);
                    });
                    console.log("");
                }
                return pergunta();
            }

            if (input.toLowerCase() === "/modelo" || input.toLowerCase() === "\\modelo") {
                const modelo = settings.openrouterModel || "google/gemini-2.5-flash";
                console.log(`${c.cyan}modelo atual: ${c.white}${modelo}${c.reset}`);
                console.log(`${c.gray}pra trocar: /modelo <nome>${c.reset}\n`);
                return pergunta();
            }

            if (input.toLowerCase().startsWith("/modelo ") || input.toLowerCase().startsWith("\\modelo ")) {
                const novoModelo = input.substring(input.indexOf("modelo ") + 7).trim();
                settings.openrouterModel = novoModelo;
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
                console.log(`${c.yellow}⚡ modelo trocado pra: ${novoModelo}${c.reset}\n`);
                return pergunta();
            }

            process.stdout.write(`${c.gray}Sarah digitando...${c.reset}`);

            const MAX_RETRIES = 3;
            const RETRY_DELAY = 10000;
            let success = false;

            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
                try {
                    const { resposta, tokens } = await callOpenRouter(history, input);
                    process.stdout.write("\r" + " ".repeat(30) + "\r");

                    if (!resposta || resposta.trim() === "") {
                        if (retry < MAX_RETRIES) {
                            await new Promise(r => setTimeout(r, RETRY_DELAY));
                            continue;
                        }
                        console.log(`${c.red}✕ resposta vazia - tenta outro modelo${c.reset}\n`);
                    } else {
                        history.push({ role: "user", content: input });
                        history.push({ role: "assistant", content: resposta });
                        saveHistory(history);
                        console.log(`${c.magenta}${c.bold}Sarah:${c.reset} ${c.white}${resposta}${c.reset} ${c.gray}${c.dim}[${tokens} tokens]${c.reset}\n`);
                    }
                    success = true;
                    break;
                } catch (e) {
                    if (retry < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, RETRY_DELAY));
                        continue;
                    }
                    process.stdout.write("\r" + " ".repeat(30) + "\r");
                    console.log(`${c.red}✕ ${e.message}${c.reset}\n`);
                }
            }

            pergunta();
        });
    };

    pergunta();
}

main();
