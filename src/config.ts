import fs from "fs";
import yaml from "js-yaml";
import Ajv from "ajv";
import { Logger } from "./utils/logger";
import { EXIT_CODES } from "./core/exit-codes";
import schema from "./schema.json";
export interface ConfigElement {
  help: string;
  type: string;
  default: any;
  options?: any[];
  action?: string;
  required?: boolean;
}

export interface CustomConfig {
  [key: string]: ConfigElement;
}

class Config {
  private static instance: Config;
  private config: any;

  private constructor(args: any = {}) {
    const configPath = ".elyseum.yml";
    if (fs.existsSync(configPath)) {
      Logger.debug(`Loading config from ${configPath}`);

      let parsed: any;
      try {
        parsed = yaml.load(fs.readFileSync(configPath, "utf8"));
      } catch (e: any) {
        Logger.error(`Invalid config: cannot parse ${configPath}: ${e.message}`);
        process.exit(EXIT_CODES.INVALID_CONFIG);
      }

      // An empty file parses to undefined and simply means "no config".
      const yamlConfig: any = parsed ?? {};

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);

      // Every validation error is surfaced; invalid config is exit code 2.
      const valid: boolean = validate(yamlConfig);
      if (!valid) {
        for (const error of validate.errors ?? []) {
          Logger.error(`Invalid config: ${error.instancePath} ${error.message}`);
        }
        process.exit(EXIT_CODES.INVALID_CONFIG);
      }

      this.config = yamlConfig["config"] || {};

      const env =
        args["environment"] || yamlConfig["default-environment"] || "auto";
      delete args["environment"];
      let envConfig = {};
      if (yamlConfig["environments"]) {
        if (env === "auto") {
          if (process.env.GITHUB_ACTIONS) {
            envConfig =
              yamlConfig["environments"]["github"] ||
              yamlConfig["environments"]["ci"] ||
              {};
          } else if (process.env.GITLAB_CI) {
            envConfig =
              yamlConfig["environments"]["github"] ||
              yamlConfig["environments"]["ci"] ||
              {};
          } else {
            envConfig = yamlConfig["environments"]["local"] || {};
          }
        } else {
          envConfig = yamlConfig["environments"][env] || {};
        }
      }
      this.config = { ...this.config, ...envConfig };

      Logger.debug(`Config: ${JSON.stringify(this.config)}`);
    } else {
      this.config = {};
    }
    // go though args and override config, args are field_nested_nested
    for (const key of Object.keys(args)) {
      const parts = key.split("_");
      let config = this.config;
      while (parts.length > 1) {
        const part = parts.shift();
        if (part === undefined) {
          continue;
        }
        if (config[part] === undefined) {
          config[part] = {};
        }
        config = config[part];
      }
      const lastKey = parts.shift();
      if (lastKey === undefined) {
        continue;
      }
      // Merge the config if the args key is not a default arg value.
      // A CLI value never clobbers an object subtree: passing
      // --reporter.coverage a,b must not discard sibling gates configured
      // under reporter.coverage.
      if (config[lastKey] !== undefined) {
        if (this.isSet(key) && !this.isObject(config[lastKey])) {
          config[lastKey] = args[key];
        }
      } else {
        config[lastKey] = args[key];
      }
    }
    Logger.debug(`Final config: ${JSON.stringify(this.config)}`);
  }

  private isSet(argName: string) {
    // Args arrive with underscore dests (coverage_lcov_path); the flag a
    // user types is the dotted form (--coverage.lcov-path).
    const flag = `--${argName.replace(/_/g, ".")}`;
    return process.argv.some((a) => a === flag || a.startsWith(`${flag}=`));
  }

  private isObject(value: any): boolean {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  public static getInstance(args: any = {}): Config {
    if (!Config.instance) {
      Config.instance = new Config(args);
    }
    return Config.instance;
  }

  public get(key: string, defaultValue: any = null): any {
    let parts = key.split(".");
    let config = this.config;
    while (parts.length) {
      const part = parts.shift();
      if (part === undefined || config[part] === undefined) {
        return defaultValue;
      }
      config = config[part];
    }
    return config || defaultValue;
  }

  public getFirst(
    keys: string[],
    defaultValue: any = null,
    converter: any = (x: any) => x
  ): any {
    for (const key of keys) {
      const value = this.get(key);
      if (value !== null) {
        return converter(value);
      }
    }
    return defaultValue;
  }

  public static get(
    context: string,
    keys: string[] | string,
    defaultValue: any = null
  ): any {
    if (typeof keys === "string") {
      return Config.getInstance().get(`${context}.${keys}`, defaultValue);
    }
    return Config.getInstance().getFirst(
      keys.map((key) => `${context}.${key}`),
      defaultValue
    );
  }

  public static getConfig(): any {
    return Config.getInstance().config;
  }

  public static getEnvironments(): string[] {
    const environments = ["auto"];
    const configPath = ".elyseum.yml";
    if (fs.existsSync(configPath)) {
      let yamlConfig: any;
      try {
        yamlConfig = yaml.load(fs.readFileSync(configPath, "utf8")) ?? {};
      } catch (e: any) {
        Logger.error(`Invalid config: cannot parse ${configPath}: ${e.message}`);
        process.exit(EXIT_CODES.INVALID_CONFIG);
      }
      if (yamlConfig && yamlConfig["environments"]) {
        for (const env of Object.keys(yamlConfig["environments"])) {
          environments.push(env);
        }
      }
    }
    return environments;
  }
}

export default Config;
