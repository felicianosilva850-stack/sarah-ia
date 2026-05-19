const { exec } = require("child_process");
const os = require("os");

const isWindows = os.platform() === 'win32';
const dicaTerminal = isWindows 
    ? "DICA PARA WINDOWS: Para abrir links/sites use 'start <link>' (ex: start https://youtube.com). Para abrir programas use o nome do executável."
    : "DICA PARA TERMUX/ANDROID: Para abrir links/sites use 'termux-open-url <link>'. Para abrir apps use 'monkey -p <pacote> 1'. Não use 'start' no Termux.";

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "run_terminal_command",
            description: `Executa comandos no terminal do sistema. ${dicaTerminal}`,
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "Comando a ser executado."
                    }
                },
                required: ["command"]
            }
        }
    },
    async execute(args) {
        return new Promise((resolve) => {
            const cmd = args.command || "";
            exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) resolve(`Erro: ${error.message}\n${stderr}`);
                else resolve(stdout ? stdout : "Comando executado com sucesso (sem saída visível).");
            });
        });
    }
};