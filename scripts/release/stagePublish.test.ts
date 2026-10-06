import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stagePublish } from "./stagePublish";

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
		"packages/sdk/src/models/\n# sync-only\nbun.lock\npackages/*/package.json\n",
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

	test("leaves unlisted changes unstaged and reports them", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/hooks/custom.ts", "changed\n");
		await write(root, "apps/docs/docs.json", '{"nav":1}\n');

		const result = stagePublish({ root });

		expect(result.staged).toEqual([]);
		expect(result.unlisted).toEqual([
			"apps/docs/docs.json",
			"packages/sdk/src/hooks/custom.ts",
		]);
		expect(git(root, "diff", "--cached", "--name-only")).toBe("");
	});
});
