const fs = require("fs");
const path = require("path");

// ══════════════════════════════════════════
//  CARREGAMENTO DE SKILLS
// ══════════════════════════════════════════

const loadedSkills = {};
const groqTools = [];
const SKILLS_DIR = path.join(__dirname, "..", "skills");
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
//  CONVERSÃO DE TOOL PARA FORMATO GEMINI
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

module.exports = {
    loadedSkills,
    groqTools,
    convertToolToGemini
};
