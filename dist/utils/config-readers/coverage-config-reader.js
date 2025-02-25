import fs from "fs";
import path from "path";
function readCoverageConfig(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    // we cannot import the config directly, we need to open the file and parse it
    const configContent = fs
        .readFileSync(filePath, "utf-8")
        .replace(/\r\n/g, "\n");
    // the file can contain any code, so we need to use a regex to find coverage: { ... }
    const coverageConfigMatch = configContent.match(/(coverage:\s*{[^}]*})/);
    if (!coverageConfigMatch) {
        return null;
    }
    const coverageConfig = coverageConfigMatch[1]
        .replace("coverage:", "")
        .replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ')
        .replace(/,(\s*})/g, "$1")
        .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(coverageConfig);
}
export function getCoverageExcludes(configDir) {
    const tools = ["vitest", "jest", "mocha"];
    let excludes = [];
    for (const tool of tools) {
        const configPaths = [
            path.join(configDir, `vite.config.js`),
            path.join(configDir, `vite.config.mjs`),
            path.join(configDir, `${tool}.config.js`),
            path.join(configDir, `${tool}.config.mjs`),
        ];
        for (const configPath of configPaths) {
            const config = readCoverageConfig(configPath);
            if (config) {
                return config.exclude;
            }
        }
    }
    return excludes;
}
