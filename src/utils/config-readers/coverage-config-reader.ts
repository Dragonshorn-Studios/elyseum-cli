import fs from "fs";
import path from "path";
import { Logger } from "../logger";

interface CoverageConfig {
  exclude: string[];
}

function readCoverageConfig(filePath: string): CoverageConfig | null {
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

export function getCoverageExcludes(configDir: string): string[] {
  const tools = ["vitest", "jest", "mocha", "vite"];
  let excludes: string[] = [];

  for (const tool of tools) {
    const configPaths = [
      path.join(configDir, `${tool}.config.js`),
      path.join(configDir, `${tool}.config.mjs`),
    ];

    for (const configPath of configPaths) {
      const config = readCoverageConfig(configPath);
      if (config) {
        Logger.debug(`Found coverage config in ${configPath}`);
        Logger.debug(`Excludes: ${config.exclude.join(", ")}`);
        return config.exclude;
      }
    }
  }
  return excludes;
}
