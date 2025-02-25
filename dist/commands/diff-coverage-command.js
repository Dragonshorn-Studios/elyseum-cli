import ora from "ora";
import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
export class DiffCoverageCommand {
    constructor() {
        this.fsClient = new LightningFS("fs");
        this.promisifiedFs = this.fsClient.promises;
    }
    async run(args) {
        const spinner = ora("Processing...").start();
        spinner.start();
        try {
            await git.currentBranch({ fs: this.fsClient, dir: process.cwd() });
        }
        catch (_error) {
            spinner.fail("Not a git repository");
            return;
        }
        try {
            // Do something
            spinner.succeed("Done");
        }
        catch (error) {
            spinner.fail("Failed");
        }
    }
    getChangedFiles() {
        let changedFiles = [];
        // Get changed files in the current branch relative to the base branch
        return changedFiles;
    }
}
