/**
 * Cross-machine global lock via an atomic git ref on the shared GitHub remote.
 *
 * Teammates run `bun tw` concurrently with NO shared DB, so mutual exclusion
 * rides on the one thing everyone shares: the git remote. Creating a ref is
 * server-side atomic (the push is rejected if the ref already exists — a lock
 * commit has no parent, so updating is never a fast-forward), which makes
 * `refs/tw/locks/<name>` a correct distributed mutex. The lock holder's
 * `{ owner, startedAt, runId }` rides in the commit message so a breaker can
 * log whose stale lock it cleared. Hold locks for SECONDS (a claim phase), not
 * the whole run.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const LOCK_BREAK_AFTER_MS = 5 * 60 * 1000;
const LOCK_POLL_MS = 3000;
const LOCK_ACQUIRE_TIMEOUT_MS = 4 * 60 * 1000;
/** Git's canonical empty tree — lets the lock commit carry only a message. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export type LockMeta = { owner: string; startedAt: number; runId: string };

const lockRef = (name: string): string => `refs/tw/locks/${name}`;

const git = async (args: string[]): Promise<string> => {
	const { stdout } = await run("git", args, { timeout: 30_000 });
	return stdout.trim();
};

/** Create the lock commit locally (empty tree, no parent, JSON meta as message). */
const makeLockCommit = async (meta: LockMeta): Promise<string> =>
	git([
		"-c",
		"user.name=tw-lock",
		"-c",
		"user.email=tw-lock@useautumn.com",
		"commit-tree",
		EMPTY_TREE,
		"-m",
		JSON.stringify(meta),
	]);

/** Try to CREATE the remote ref; false if it already exists (lock held). */
const tryAcquire = async (name: string, commit: string): Promise<boolean> => {
	try {
		await git(["push", "--quiet", "origin", `${commit}:${lockRef(name)}`]);
		return true;
	} catch {
		return false;
	}
};

/** Read the current holder's meta (fetches the lock ref). Null if unreadable. */
const readHolder = async (
	name: string,
): Promise<{ sha: string; meta: LockMeta | null } | null> => {
	try {
		const line = await git(["ls-remote", "origin", lockRef(name)]);
		const sha = line.split("\t")[0];
		if (!sha) {
			return null;
		}
		await git(["fetch", "--quiet", "origin", lockRef(name)]);
		try {
			const message = await git(["log", "-1", "--format=%B", sha]);
			return { sha, meta: JSON.parse(message) as LockMeta };
		} catch {
			return { sha, meta: null };
		}
	} catch {
		return null;
	}
};

/** Delete the remote lock ref, but only if it still points at `expectedSha`. */
const releaseRef = async (name: string, expectedSha: string): Promise<void> => {
	await git([
		"push",
		"--quiet",
		`--force-with-lease=${lockRef(name)}:${expectedSha}`,
		"origin",
		`:${lockRef(name)}`,
	]);
};

export type HeldLock = { name: string; meta: LockMeta | null };

/** All currently-held global locks on the remote (for `bun tw doctor`). */
export const listHeldLocks = async (): Promise<HeldLock[]> => {
	let lines: string;
	try {
		lines = await git(["ls-remote", "origin", "refs/tw/locks/*"]);
	} catch {
		return [];
	}
	const names = lines
		.split("\n")
		.map((line) => line.split("\t")[1])
		.filter((ref): ref is string => Boolean(ref))
		.map((ref) => ref.replace("refs/tw/locks/", ""));
	return Promise.all(
		names.map(async (name) => {
			const holder = await readHolder(name);
			return { name, meta: holder?.meta ?? null };
		}),
	);
};

/**
 * Run `fn` under the named global lock. Acquire = atomic ref create; contested
 * = poll; holder older than `breakAfterMs` = break it (logged) and retry.
 */
export const withGlobalLock = async <T>({
	name,
	meta,
	fn,
	breakAfterMs = LOCK_BREAK_AFTER_MS,
	acquireTimeoutMs = LOCK_ACQUIRE_TIMEOUT_MS,
	log = () => {},
}: {
	name: string;
	meta: LockMeta;
	fn: () => Promise<T>;
	breakAfterMs?: number;
	acquireTimeoutMs?: number;
	log?: (line: string) => void;
}): Promise<T> => {
	const commit = await makeLockCommit({ ...meta, startedAt: Date.now() });
	const deadline = Date.now() + acquireTimeoutMs;

	while (!(await tryAcquire(name, commit))) {
		const holder = await readHolder(name);
		if (holder) {
			const age = holder.meta ? Date.now() - holder.meta.startedAt : Number.NaN;
			if (!holder.meta || age > breakAfterMs) {
				log(
					`lock ${name}: breaking stale lock held by ${holder.meta?.owner ?? "unknown"} (run ${holder.meta?.runId ?? "?"}, age ${Math.round(age / 1000)}s)`,
				);
				await releaseRef(name, holder.sha).catch(() => {
					// Someone else broke/released it first — the retry loop handles it.
				});
				continue;
			}
			log(
				`lock ${name}: held by ${holder.meta.owner} (run ${holder.meta.runId}) — waiting`,
			);
		}
		if (Date.now() > deadline) {
			throw new Error(
				`lock ${name}: could not acquire within ${acquireTimeoutMs}ms`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
	}

	try {
		return await fn();
	} finally {
		await releaseRef(name, commit).catch(() => {
			// Best-effort: a stale-break already cleared it; the 5-min TTL is the backstop.
		});
	}
};
