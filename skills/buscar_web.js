// Skill: Busca Web via DuckDuckGo Instant Answer API
// Sem necessidade de API key

const definition = {
    type: "function",
    function: {
        name: "buscar_web",
        description: "Pesquisa informações na internet sobre qualquer assunto. Use quando o usuário perguntar algo que você não sabe, pedir notícias, ou precisar de dados atualizados.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "O termo de busca / pergunta para pesquisar na internet"
                }
            },
            required: ["query"]
        }
    }
};

async function execute(args) {
    const { query } = args;
    if (!query) return "Erro: nenhuma query fornecida.";

    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const response = await fetch(url);
        const data = await response.json();

        const results = [];

        // Abstract (resposta direta)
        if (data.Abstract) {
            results.push(`📌 ${data.AbstractSource}: ${data.Abstract}`);
        }

        // Answer (resposta instantânea)
        if (data.Answer) {
            results.push(`✅ ${data.Answer}`);
        }

        // Definition
        if (data.Definition) {
            results.push(`📖 Definição: ${data.Definition}`);
        }

        // Related Topics (até 5)
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            const topics = data.RelatedTopics
                .filter(t => t.Text)
                .slice(0, 5)
                .map((t, i) => `${i + 1}. ${t.Text}`);
            if (topics.length > 0) {
                results.push(`\n🔍 Resultados relacionados:\n${topics.join('\n')}`);
            }
        }

        if (results.length === 0) {
            return `Não encontrei resultados diretos para "${query}". Tente reformular a pergunta.`;
        }

        return results.join('\n\n');
    } catch (e) {
        return `Erro ao buscar: ${e.message}`;
    }
}

module.exports = { definition, execute };
