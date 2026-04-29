module.exports = {
    definition: {
        type: "function",
        function: {
            name: "consultar_clima",
            description: "Consulta a previsão do tempo e temperatura atual de uma cidade.",
            parameters: {
                type: "object",
                properties: {
                    cidade: {
                        type: "string",
                        description: "O nome da cidade. Exemplo: São Paulo, Rio de Janeiro"
                    }
                },
                required: ["cidade"]
            }
        }
    },
    async execute(args) {
        try {
            const cidade = args.cidade || "São Paulo";
            const response = await fetch(`https://wttr.in/${encodeURIComponent(cidade)}?format=3`);
            const clima = await response.text();
            return clima || "Não foi possível pegar o clima.";
        } catch (e) {
            return `Erro ao buscar clima: ${e.message}`;
        }
    }
};