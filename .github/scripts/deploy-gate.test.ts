import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	advanceBasePastPublishCommits,
	type CommitSummary,
	decide,
	listCommitsAfter,
	selectBaseSha,
} from "./deploy-gate";

const repoRoot = join(import.meta.dir, "../..");
const BOT = "autumn-codegen[bot]";

let root = "";
let base = "";
// Commits made here are authored by the local identity; these SHAs stand in for publish-bot commits.
const botShas = new Set<string>();

const git = (...args: string[]) => {
	const result = Bun.spawnSync(["git", ...args], { cwd: root });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
};

const commit = async ({ message, file }: { message: string; file: string }) => {
	const path = join(root, file);
	await Bun.write(path, `${await Bun.file(path).text()}\n`);
	git("add", file);
	git("commit", "-q", "--no-verify", "-m", message);
	return git("rev-parse", "HEAD");
};

const publishSubject = () =>
	`chore: publish generated files for ${base.slice(0, 8)} [skip ci]`;

const botPublish = async () => {
	const sha = await commit({ message: publishSubject(), file: "bun.lock" });
	botShas.add(sha);
	return sha;
};

const listCommits = (args: {
	root: string;
	baseSha: string;
}): CommitSummary[] =>
	listCommitsAfter(args).map((commit) =>
		botShas.has(commit.sha) ? { ...commit, author: BOT } : commit,
	);

const advance = () =>
	advanceBasePastPublishCommits({
		commits: listCommits({ root, baseSha: base }),
		baseSha: base,
	});

beforeAll(() => {
	root = join(mkdtempSync(join(tmpdir(), "deploy-gate-")), "repo");
	Bun.spawnSync(["git", "worktree", "add", "-q", "--detach", root, "HEAD"], {
		cwd: repoRoot,
	});
	symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"));
	base = git("rev-parse", "HEAD");
});

afterAll(() => {
	Bun.spawnSync(["git", "worktree", "remove", "--force", root], {
		cwd: repoRoot,
	});
});

beforeEach(() => {
	git("reset", "-q", "--hard", base);
	botShas.clear();
});

describe("deploy gate base", () => {
	test("advances past a publish-bot commit right after the base", async () => {
		const bot = await botPublish();
		await commit({ message: "feat: ui", file: "vite/package.json" });
		expect(advance()).toBe(bot);
	});

	test("advances past consecutive publish-bot commits to the newest", async () => {
		await botPublish();
		const second = await botPublish();
		expect(advance()).toBe(second);
	});

	test("a human commit between the base and the bot commit stops the advance", async () => {
		await commit({ message: "fix: server", file: "server/package.json" });
		await botPublish();
		expect(advance()).toBe(base);
	});

	test("a bot commit with another subject is not skipped", async () => {
		const sha = await commit({
			message: "chore: bump autumn-js to 1.3.60",
			file: "bun.lock",
		});
		botShas.add(sha);
		expect(advance()).toBe(base);
	});

	test("a human commit with the publish subject is not skipped", async () => {
		await commit({ message: publishSubject(), file: "bun.lock" });
		expect(advance()).toBe(base);
	});
});

describe("deploy decision after a publish-bot commit", () => {
	test("a vite-only change after the bot's bun.lock bump does not deploy", async () => {
		await botPublish();
		await commit({ message: "feat: ui", file: "vite/package.json" });
		expect((await decide({ root, baseSha: base, listCommits })).deploy).toBe(
			false,
		);
	}, 60_000);

	test("a server change after the bot commit deploys", async () => {
		await botPublish();
		await commit({ message: "fix: server", file: "server/package.json" });
		expect((await decide({ root, baseSha: base, listCommits })).deploy).toBe(
			true,
		);
	}, 60_000);

	test("bun.lock changed by a human still deploys", async () => {
		await commit({ message: "chore: deps", file: "bun.lock" });
		expect(await decide({ root, baseSha: base, listCommits })).toEqual({
			deploy: true,
			reason: "bun.lock changed",
		});
	}, 60_000);
});

describe("base build selection", () => {
	const run = (
		overrides: Partial<Parameters<typeof selectBaseSha>[0]["runs"][number]>,
	) => ({
		headSha: "a".repeat(40),
		conclusion: "success",
		event: "push",
		headBranch: "main",
		createdAt: "2026-10-06T10:00:00Z",
		...overrides,
	});

	test("picks the newest successful main push, whatever order the API returns", () => {
		expect(
			selectBaseSha({
				runs: [
					run({ headSha: "stale", createdAt: "2026-09-24T10:00:00Z" }),
					run({ headSha: "newest", createdAt: "2026-10-06T17:22:37Z" }),
					run({ headSha: "older", createdAt: "2026-10-06T16:20:35Z" }),
				],
			}),
		).toBe("newest");
	});

	test("ignores other branches, other events, and unsuccessful runs", () => {
		expect(
			selectBaseSha({
				runs: [
					run({
						headSha: "dev",
						headBranch: "dev",
						createdAt: "2026-10-07T00:00:00Z",
					}),
					run({
						headSha: "manual",
						event: "workflow_dispatch",
						createdAt: "2026-10-07T00:00:01Z",
					}),
					run({
						headSha: "failed",
						conclusion: "failure",
						createdAt: "2026-10-07T00:00:02Z",
					}),
					run({
						headSha: "running",
						conclusion: "",
						createdAt: "2026-10-07T00:00:03Z",
					}),
					run({ headSha: "good" }),
				],
			}),
		).toBe("good");
	});

	test("returns an empty base when nothing qualifies", () => {
		expect(selectBaseSha({ runs: [run({ conclusion: "cancelled" })] })).toBe(
			"",
		);
	});
});
