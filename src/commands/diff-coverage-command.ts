import ora from "ora";
import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";

export class DiffCoverageCommand {
  fsClient: LightningFS = new LightningFS("fs");
  promisifiedFs: typeof this.fsClient.promises = this.fsClient.promises;

  public async run(args: string[]): Promise<void> {
    const spinner = ora("Processing...").start();
    spinner.start();

    try {
      await git.currentBranch({ fs: this.fsClient, dir: process.cwd() });
    } catch (_error) {
      spinner.fail("Not a git repository");
      return;
    }

    try {
      // Do something
      spinner.succeed("Done");
    } catch (error) {
      spinner.fail("Failed");
    }
  }

  private getChangedFiles(): string[] {
    let changedFiles: string[] = [];
    // Get changed files in the current branch relative to the base branch

    return changedFiles;
  }
}
