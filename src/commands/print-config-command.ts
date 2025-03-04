import { Command } from "./command";
import Config from "../config";
import { Logger } from "../utils/logger";
import yaml from "js-yaml";

export class PrintConfigCommand {
  name: string = "print-config";
  constructor(commands: any) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<void> {
    Logger.debug("Fetching config");
    const config = Config.getConfig();
    const yamlRepresentation = yaml.dump(config);
    for (const line of yamlRepresentation.split("\n")) {
      Logger.info(line);
    }
  }
}
