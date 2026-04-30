const { exec } = require("child_process");

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "run_terminal_command",
            description: "Executa comandos no terminal. DICA PARA TERMUX/ANDROID: Para abrir links/sites use 'termux-open-url <link>' (ex: termux-open-url https://google.com). Para abrir apps Android use 'monkey -p <nome.do.pacote> 1' (ex: monkey -p com.google.android.youtube 1). Não use 'start' ou 'xdg-open' no Termux.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "Comando a ser executado no terminal."
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