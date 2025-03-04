import fs from "fs";
import { CoverageCommand } from "./coverage-command";
import { DiffCoverageCommand } from "./diff-coverage-command";
import { CustomConfig } from "../config";
import { PrintConfigCommand } from "./print-config-command";
import { Logger } from "../utils/logger"; // Import the logger

export interface Command {
  run(args: any): Promise<void>;
  config?: CustomConfig;
  name: string;
}

export interface CommandMap {
  [key: string]: Command;
}

export class CommandFactory {
  commands: CommandMap = {};

  constructor() {
    new CoverageCommand(this.commands);
    new DiffCoverageCommand(this.commands);
    new PrintConfigCommand(this.commands);
  }

  getCommand(args: any): Command | undefined {
    try {
      Logger.debug(`Fetching command: ${args.command}`); // Add debug log
      return this.commands[args.command];
    } catch (error: any) {
      Logger.error(`Error fetching command: ${error.message}`); // Add error log
      return undefined;
    }
  }

  getAvailableCommands() {
    Logger.debug("Fetching available commands"); // Add debug log
    let availableCommands = [];
    for (const command of Object.keys(this.commands)) {
      availableCommands.push(command);
    }
    return availableCommands;
  }

  addCommandArgs(yargs: any): void {
    Logger.debug("Adding command arguments"); // Add debug log
    for (const command of this.getAvailableCommands()) {
      const commandInstance = this.commands[command];
      const commandGroup = yargs.add_argument_group({
        title: `Command: ${command}`,
      });
      if (commandInstance.config) {
        for (const key of Object.keys(commandInstance.config)) {
          commandGroup.add_argument(`--${command}.${key}`, {
            ...commandInstance.config[key],
            dest: `${command}_${key}`,
          });
        }
      }
    }
  }
}
