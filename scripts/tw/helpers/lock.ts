import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const gitEnv = Object.fromEntries(
	Object.entries(process.env).filter(
		([key]) => key !== "GITHUB_TOKEN" && key !== "GH_TOKEN",
	),
);

const LOCK_BREAK_AFTER_MS = 5 * 60 * 1000;
const LOCK_POLL_MS = 3000;
const LOCK_ACQUIRE_TIMEOUT_MS = 4 * 60 * 1000;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export type LockMeta = { owner: string; startedAt: number; runId: string };

const lockRef = (name: string): string => `refs/tw/locks/${name}`;

const git = async (args: string[]): Promise<string> => {
	const { stdout } = await run("git", args, { timeout: 30_000, env: gitEnv });
	return stdout.trim();
};

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

const tryAcquire = async (name: string, commit: string): Promise<boolean> => {
	try {
		await git(["push", "--quiet", "origin", `${commit}:${lockRef(name)}`]);
		return true;
	} catch {
		return false;
	}
};

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
				await releaseRef(name, holder.sha).catch(() => {});
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
		await releaseRef(name, commit).catch(() => {});
	}
};
