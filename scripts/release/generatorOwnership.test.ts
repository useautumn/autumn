import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGeneratorOwnership } from "./generatorOwnership";

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

export const GENERATED_PAGE =
	'---\ntitle: "X"\n---\n\nimport { DynamicParamField } from "/snippets/dynamic-param-field.jsx";\n';

const genLock = (files: string[]) =>
	`lockVersion: 2.0.0\ntrackedFiles:\n${files.map((file) => `  ${file}:\n    id: x\n`).join("")}`;

const createRepo = async () => {
	const root = mkdtempSync(join(tmpdir(), "generator-ownership-"));
	repos.push(root);
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "test");
	await write(
		root,
		"packages/sdk/.speakeasy/gen.lock",
		genLock(["src/sdk/old.ts", "src/core.ts"]),
	);
	await write(
		root,
		"others/python-sdk/.speakeasy/gen.lock",
		genLock(["src/autumn_sdk/sdk.py"]),
	);
	await write(root, "packages/sdk/src/sdk/old.ts", "old\n");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "initial");
	return root;
};

describe("generator ownership", () => {
	test("Speakeasy owns files its gen.lock tracks, including newly tracked ones", async () => {
		const root = await createRepo();
		await write(
			root,
			"packages/sdk/.speakeasy/gen.lock",
			genLock(["src/sdk/old.ts", "src/core.ts", "src/newRoot.ts"]),
		);
		const owned = loadGeneratorOwnership({ root });
		expect(owned("packages/sdk/src/newRoot.ts")).toBe(true);
		expect(owned("packages/sdk/src/core.ts")).toBe(true);
		expect(owned("others/python-sdk/src/autumn_sdk/sdk.py")).toBe(true);
	});

	test("files Speakeasy stopped tracking still count, so deletions stage", async () => {
		const root = await createRepo();
		await write(
			root,
			"packages/sdk/.speakeasy/gen.lock",
			genLock(["src/core.ts"]),
		);
		expect(
			loadGeneratorOwnership({ root })("packages/sdk/src/sdk/old.ts"),
		).toBe(true);
	});

	test("hand-written SDK files are not owned", async () => {
		const root = await createRepo();
		const owned = loadGeneratorOwnership({ root });
		expect(owned("packages/sdk/src/hooks/failOpenHook.ts")).toBe(false);
		expect(
			owned("others/python-sdk/src/autumn_sdk/_hooks/registration.py"),
		).toBe(false);
	});

	test("API reference pages are owned by their generator marker", async () => {
		const root = await createRepo();
		await write(
			root,
			"apps/docs/mintlify/api-reference/newGroup/newThing.mdx",
			GENERATED_PAGE,
		);
		await write(
			root,
			"apps/docs/mintlify/api-reference/platform/hand-written.mdx",
			"---\ntitle: Hand\n---\nProse.\n",
		);
		const owned = loadGeneratorOwnership({ root });
		expect(
			owned("apps/docs/mintlify/api-reference/newGroup/newThing.mdx"),
		).toBe(true);
		expect(
			owned("apps/docs/mintlify/api-reference/platform/hand-written.mdx"),
		).toBe(false);
	});

	test("a deleted generated page is owned by its committed content", async () => {
		const root = await createRepo();
		const page = "apps/docs/mintlify/api-reference/core/gone.mdx";
		await write(root, page, GENERATED_PAGE);
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "page");
		rmSync(join(root, page));
		expect(loadGeneratorOwnership({ root })(page)).toBe(true);
	});

	test("anything inside a generated/ folder is owned", async () => {
		const root = await createRepo();
		const owned = loadGeneratorOwnership({ root });
		expect(owned("packages/atmn/src/generated/newFile.ts")).toBe(true);
		expect(owned("packages/agent-docs/generated/skills/x/y.md")).toBe(true);
		expect(owned("packages/atmn/src/generatedish.ts")).toBe(false);
	});

	test("files outside the generated roots are never owned", async () => {
		const root = await createRepo();
		const owned = loadGeneratorOwnership({ root });
		expect(owned("server/src/index.ts")).toBe(false);
		expect(owned("apps/docs/mintlify/welcome.mdx")).toBe(false);
	});
});
