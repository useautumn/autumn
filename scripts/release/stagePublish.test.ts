import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GENERATED_PAGE } from "./generatorOwnership.test";
import { discardUnknownChanges, stagePublish } from "./stagePublish";

const repos: string[] = [];
afterEach(() => {
	for (const repo of repos.splice(0)) rmSync(repo, { recursive: true });
});

const git = (root: string, ...args: string[]) =>
	Bun.spawnSync(["git", ...args], { cwd: root })
		.stdout.toString()
		.trim();

const write = (root: string, path: string, text: string) =>
	Bun.write(join(root, path), text);

const createRepo = async () => {
	const root = mkdtempSync(join(tmpdir(), "stage-publish-"));
	repos.push(root);
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "test");
	await write(
		root,
		".github/generated-paths.txt",
		"packages/sdk/src/models/\n# sync-only\nbun.lock\napps/docs/docs.json\npackages/*/package.json\n",
	);
	await write(root, "packages/sdk/src/models/a.ts", "a\n");
	await write(root, "packages/sdk/src/hooks/custom.ts", "custom\n");
	await write(root, "packages/gateway/package.json", "{}\n");
	await write(root, "bun.lock", "lock\n");
	await write(root, "apps/docs/docs.json", "{}\n");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "initial");
	return root;
};

describe("stage publish", () => {
	test("stages listed changes, including sync-only files and new files", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/models/a.ts", "a2\n");
		await write(root, "packages/sdk/src/models/new.ts", "new\n");
		await write(root, "packages/gateway/package.json", '{"version":"1"}\n');
		await write(root, "bun.lock", "lock2\n");

		const result = stagePublish({ root });

		expect(result.unlisted).toEqual([]);
		expect(result.staged).toEqual([
			"bun.lock",
			"packages/gateway/package.json",
			"packages/sdk/src/models/a.ts",
			"packages/sdk/src/models/new.ts",
		]);
		expect(git(root, "diff", "--cached", "--name-only").split("\n")).toEqual(
			result.staged,
		);
	});

	test("stages listed deletions", async () => {
		const root = await createRepo();
		rmSync(join(root, "packages/sdk/src/models/a.ts"));
		expect(stagePublish({ root }).staged).toEqual([
			"packages/sdk/src/models/a.ts",
		]);
		expect(git(root, "diff", "--cached", "--name-status")).toBe(
			"D\tpackages/sdk/src/models/a.ts",
		);
	});

	test("stages a new generated page in a new API reference folder", async () => {
		const root = await createRepo();
		const page = "apps/docs/mintlify/api-reference/newGroup/newThing.mdx";
		await write(root, page, GENERATED_PAGE);
		expect(stagePublish({ root })).toEqual({ staged: [page], unlisted: [] });
	});

	test("stages docs.json from the sync-only section", async () => {
		const root = await createRepo();
		await write(root, "apps/docs/docs.json", '{"nav":["webhooks"]}\n');
		expect(stagePublish({ root })).toEqual({
			staged: ["apps/docs/docs.json"],
			unlisted: [],
		});
	});

	test("stages listed changes and leaves unknown ones unstaged", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/models/a.ts", "a2\n");
		await write(root, "packages/sdk/src/hooks/custom.ts", "changed\n");
		await write(root, "server/new.ts", "x\n");

		const result = stagePublish({ root });

		expect(result.unlisted).toEqual([
			"packages/sdk/src/hooks/custom.ts",
			"server/new.ts",
		]);
		expect(result.staged).toEqual(["packages/sdk/src/models/a.ts"]);
		expect(git(root, "diff", "--cached", "--name-only")).toBe(
			"packages/sdk/src/models/a.ts",
		);
	});

	test("the CLI warns about each unknown file, succeeds, and outputs them", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/models/a.ts", "a2\n");
		await write(root, "server/new.ts", "x\n");
		const output = join(root, ".gh-output");
		const run = Bun.spawnSync(
			["bun", join(import.meta.dir, "stagePublish.ts"), root],
			{ cwd: root, env: { ...process.env, GITHUB_OUTPUT: output } },
		);
		const log = run.stdout.toString() + run.stderr.toString();
		expect(run.exitCode).toBe(0);
		expect(log).toContain("::warning file=server/new.ts::");
		expect(log).not.toContain("::error");
		expect(await Bun.file(output).text()).toBe("unknown-files=server/new.ts\n");
		expect(git(root, "diff", "--cached", "--name-only")).toBe(
			"packages/sdk/src/models/a.ts",
		);
	});

	test("the CLI outputs an empty list when every change is known", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/models/a.ts", "a2\n");
		const output = join(root, ".gh-output");
		const run = Bun.spawnSync(
			["bun", join(import.meta.dir, "stagePublish.ts"), root],
			{ cwd: root, env: { ...process.env, GITHUB_OUTPUT: output } },
		);
		expect(run.exitCode).toBe(0);
		expect(await Bun.file(output).text()).toBe("unknown-files=\n");
	});

	test("discarding unknown changes restores edited files and removes new ones, keeping known changes", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/models/a.ts", "a2\n");
		await write(root, "packages/sdk/src/hooks/custom.ts", "changed\n");
		await write(root, "packages/sdk/src/hooks/new.ts", "new\n");

		expect(discardUnknownChanges({ root })).toEqual([
			"packages/sdk/src/hooks/custom.ts",
			"packages/sdk/src/hooks/new.ts",
		]);
		expect(
			await Bun.file(join(root, "packages/sdk/src/hooks/custom.ts")).text(),
		).toBe("custom\n");
		expect(
			await Bun.file(join(root, "packages/sdk/src/hooks/new.ts")).exists(),
		).toBe(false);
		expect(git(root, "status", "--porcelain")).toBe(
			"M packages/sdk/src/models/a.ts",
		);
	});

	test("the discard CLI runs before planning: it warns, outputs the files and succeeds", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/hooks/custom.ts", "changed\n");
		const output = join(root, ".git/gh-output");
		const run = Bun.spawnSync(
			[
				"bun",
				join(import.meta.dir, "stagePublish.ts"),
				"--discard-unknown",
				root,
			],
			{ cwd: root, env: { ...process.env, GITHUB_OUTPUT: output } },
		);
		expect(run.exitCode).toBe(0);
		expect(run.stdout.toString() + run.stderr.toString()).toContain(
			"::warning file=packages/sdk/src/hooks/custom.ts::",
		);
		expect(await Bun.file(output).text()).toBe(
			"unknown-files=packages/sdk/src/hooks/custom.ts\n",
		);
		expect(git(root, "status", "--porcelain")).toBe("");
	});
});
