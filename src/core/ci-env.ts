import git from "isomorphic-git";
import fs from "fs/promises";
import { MissingGitError } from "./errors";

/**
 * Resolves the CI run identity from well-known environment variables, with
 * a documented generic-CI fallback:
 *
 * - GitHub Actions: provider "github", run_id from GITHUB_RUN_ID, job_id
 *   from GITHUB_JOB (the job's key; matrix legs share it — pass
 *   --emit-envelope.run-job-id to disambiguate), attempt from
 *   GITHUB_RUN_ATTEMPT, url from the canonical run URL.
 * - Any other CI / local runs: provider "generic", run_id = the git HEAD
 *   SHA, job_id null, attempt 1. The idempotency key is then the commit —
 *   a rerun of the same commit overwrites the same logical run.
 */
export interface RunIdentity {
  provider: string;
  run_id: string;
  job_id: string | null;
  attempt: number;
  url: string | null;
}

export function resolveRunIdentity(env: NodeJS.ProcessEnv, headSha: string): RunIdentity {
  if (env.GITHUB_RUN_ID) {
    const attempt = Number(env.GITHUB_RUN_ATTEMPT ?? "1");
    return {
      provider: "github",
      run_id: env.GITHUB_RUN_ID,
      job_id: env.GITHUB_JOB ?? null,
      attempt: Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1,
      url: env.GITHUB_REPOSITORY
        ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : null,
    };
  }

  return {
    provider: "generic",
    run_id: headSha,
    job_id: null,
    attempt: 1,
    url: null,
  };
}

/** Commit facts from the git checkout. Requires a git repository. */
export async function resolveCommitFacts(
  dir: string,
  headRef: string,
): Promise<{ sha: string; branch: string; committed_at: string | null }> {
  const gitExists = await fs
    .access(`${dir}/.git`)
    .then(() => true)
    .catch(() => false);

  if (!gitExists) {
    throw new MissingGitError(dir);
  }

  const sha = await git.resolveRef({ fs, dir, ref: headRef });
  let branch: string | null = null;
  try {
    branch = (await git.currentBranch({ fs, dir })) ?? null;
  } catch {
    branch = null;
  }

  let committedAt: string | null = null;
  try {
    const commit = (await git.readCommit({ fs, dir, oid: sha })) as any;
    committedAt = new Date(commit.commit.committer.timestamp * 1000).toISOString();
  } catch {
    committedAt = null;
  }

  return {
    sha,
    branch: branch ?? headRef,
    committed_at: committedAt,
  };
}
