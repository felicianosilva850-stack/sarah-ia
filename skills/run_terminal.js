const { exec } = require("child_process");

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "run_terminal_command",
            description: "Executa comandos no terminal do host (Windows/PowerShell ou Linux/Termux no Android). Use para ler, criar, editar arquivos ou rodar scripts. Adapte os comandos para Linux ou Windows conforme necessário.",
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
            exec(cmd, (error, stdout, stderr) => {
                if (error) resolve(`Erro: ${error.message}\n${stderr}`);
                else resolve(stdout || "Comando executado sem saída visível.");
            });
        });
    }
};