const { GoogleGenerativeAI } = require("@google/generative-ai");

const key = "COLE_SUA_CHAVE_AQUI"; // Davy, cole sua chave aqui para testarmos

async function run() {
    const genAI = new GoogleGenerativeAI(key);
    const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-2.0-flash"];
    
    for (const m of models) {
        console.log(`\nTestando modelo: ${m}`);
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Diga oi");
            console.log(`✅ Sucesso em ${m}: ${result.response.text()}`);
        } catch (e) {
            console.log(`❌ Erro em ${m}: ${e.message}`);
        }
    }
}

run();
