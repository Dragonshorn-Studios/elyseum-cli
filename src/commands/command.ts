import fs from "fs";
import { CoverageCommand } from "./coverage-command";
import { DiffCoverageCommand } from "./diff-coverage-command";

export interface Command {
  run(args: any): Promise<void>;
  config?: any;
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
  }

  getCommand(args: any): Command | undefined {
    try {
      return this.commands[args.command];
    } catch (error) {
      return undefined;
    }
  }

  getAvailableCommands() {
    let availableCommands = [];
    for (const command of Object.keys(this.commands)) {
      availableCommands.push(command);
    }
    return availableCommands;
  }

  addCommandArgs(yargs: any): void {
    for (const command of this.getAvailableCommands()) {
      const commandInstance = this.commands[command];
      if (commandInstance.config) {
        for (const key of Object.keys(commandInstance.config)) {
          yargs.add_argument(`--${command}.${key}`, {
            help: commandInstance.config[key],
            dest: `${command}_${key}`,
          });
        }
      }
    }
  }
}
