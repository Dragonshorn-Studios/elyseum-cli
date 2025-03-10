import fs from "fs";
import yaml from "js-yaml";
import Ajv from "ajv";
import { Logger } from "./utils/logger";
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
      const yamlConfig: any = yaml.load(fs.readFileSync(configPath, "utf8"));

      const ajv = new Ajv();
      const validate = ajv.compile(schema);
      try {
        let x: any = validate(yamlConfig);
        Logger.debug(`Config validation: ${JSON.stringify(x)}`);
      } catch (e) {
        Logger.error(`Invalid config: ${e}`);
        process.exit(1);
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
      // merge the config if args key is not default arg value
      if (config[lastKey] !== undefined) {
        if (this.isSet(key)) {
          config[lastKey] = args[key];
        }
      } else {
        config[lastKey] = args[key];
      }
    }
    Logger.debug(`Final config: ${JSON.stringify(this.config)}`);
  }

  private isSet(argName: string) {
    return process.argv.includes(`--${argName}`);
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
      const yamlConfig: any = yaml.load(fs.readFileSync(configPath, "utf8"));
      if (yamlConfig["environments"]) {
        for (const env of Object.keys(yamlConfig["environments"])) {
          environments.push(env);
        }
      }
    }
    return environments;
  }
}

export default Config;
