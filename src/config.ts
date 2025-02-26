import fs from "fs";
import yaml from "js-yaml";

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
      this.config = yaml.load(fs.readFileSync(configPath, "utf8"));
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
      config[lastKey] = args[key];
    }
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

  public getFirst(keys: string[], defaultValue: any = null): any {
    for (const key of keys) {
      const value = this.get(key);
      if (value !== null) {
        return value;
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
}

export default Config;
