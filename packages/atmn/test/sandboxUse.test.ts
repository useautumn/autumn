/**
 * `atmn sandbox use`: pick a sandbox by name or id, mint a key when the
 * machine has none, and pin it in .env. The API is faked; the .env is real.
 *
 * Contract:
 *   - use <name>       resolves the name (unique per org) to the id
 *   - use <id>         resolves the id as is
 *   - no key on disk   → sandboxes.create_key is called, the key is written
 *   - key on disk      → nothing minted, the pin still moves
 *   - --clear          drops the pin only; keys stay
 *   - headless, no arg → the table and the hint, nothing written
 *   - --json           org, sandbox, keyName, keyMinted, envPath, notes[]
 *   - unknown query    → error naming `atmn sandbox list`
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import type { UseSandboxClient } from "../src/actions/sandbox/types/sandboxClient";
import { runSandboxUse } from "../src/actions/sandbox/useSandbox";
import { sandboxKeyName } from "../src/env/sandboxKeyName";
import { createPrompter } from "../src/prompt/prompt";

chalk.level = 0;

const dirs: string[] = [];
const clearAutumnEnv = () => {
	for (const key of Object.keys(process.env))
		if (key.startsWith("AUTUMN_")) delete process.env[key];
};
beforeEach(clearAutumnEnv);
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
	clearAutumnEnv();
});

const projectDir = ({ env = "" }: { env?: string } = {}): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-use-"));
	dirs.push(dir);
	writeFileSync(join(dir, ".env"), env);
	return dir;
};

const envOf = (dir: string): string => readFileSync(join(dir, ".env"), "utf8");

const sandboxes = [
	{
		id: "id_pricing",
		name: "Pricing v2",
		slug: "pricing-v2",
		createdAt: 1_000,
		color: "blue" as const,
		icon: "Flask" as const,
	},
	{
		id: "id_qa",
		name: "QA",
		slug: "qa",
		createdAt: 2_000,
		color: "gray" as const,
		icon: "Flask" as const,
	},
];

const fakeClient = () => {
	const minted: string[] = [];
	const client: UseSandboxClient = {
		listSandboxes: async () => ({ list: sandboxes }),
		createSandboxKey: async ({ id }) => {
			minted.push(id);
			const row = sandboxes.find((sandbox) => sandbox.id === id);
			if (!row) throw new Error("Sandbox not found");
			return {
				id: row.id,
				name: row.name,
				slug: row.slug,
				secretKey: `am_sk_test_${id}`,
			};
		},
	};
	return { client, minted };
};

const org = { id: "org_main", name: "Acme", slug: "acme" };

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

test("a name resolves, a key is minted, and the pin is written", async () => {
	const dir = projectDir();
	const { client, minted } = fakeClient();
	const { lines, write } = capture();

	const result = await runSandboxUse({
		client,
		org,
		query: "QA",
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(minted).toEqual(["id_qa"]);
	expect(result?.sandbox.id).toBe("id_qa");
	expect(result?.keyMinted).toBe(true);
	expect(envOf(dir)).toContain(
		"AUTUMN_SANDBOX_ID_QA_SECRET_KEY=am_sk_test_id_qa\n",
	);
	expect(envOf(dir)).toContain("AUTUMN_SANDBOX_ID=id_qa\n");
	expect(lines.join("")).toBe(
		[
			"✓ Minted a key for QA (id_qa)",
			`✓ Pinned AUTUMN_SANDBOX_ID=id_qa in ${join(dir, ".env")}`,
			"  Every command now targets QA. atmn sandbox use --clear returns to the main sandbox.",
			"",
		].join("\n"),
	);
});

test("an id resolves too, and a key already on disk is not minted again", async () => {
	const keyName = sandboxKeyName({ sandboxId: "id_pricing" });
	const dir = projectDir({ env: `${keyName}=am_sk_test_existing\n` });
	const { client, minted } = fakeClient();
	const { lines, write } = capture();

	const result = await runSandboxUse({
		client,
		org,
		query: "id_pricing",
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(minted).toEqual([]);
	expect(result?.keyMinted).toBe(false);
	expect(envOf(dir)).toContain(`${keyName}=am_sk_test_existing\n`);
	expect(envOf(dir)).toContain("AUTUMN_SANDBOX_ID=id_pricing\n");
	expect(lines.join("")).not.toContain("Minted");
});

test("--clear drops the pin and keeps every key", async () => {
	const keyName = sandboxKeyName({ sandboxId: "id_qa" });
	const dir = projectDir({
		env: `${keyName}=am_sk_test_x\nAUTUMN_SANDBOX_ID=id_qa\n`,
	});
	const { client } = fakeClient();
	const { lines, write } = capture();

	// No client, no org: clearing must work logged out and offline.
	await runSandboxUse({
		clear: true,
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(envOf(dir)).toBe(`${keyName}=am_sk_test_x\n`);
	expect(lines.join("")).toBe(
		"✓ Cleared AUTUMN_SANDBOX_ID; commands target the main sandbox again.\n",
	);
});

test("an empty key on disk is minted over, not trusted", async () => {
	const keyName = sandboxKeyName({ sandboxId: "id_qa" });
	const dir = projectDir({ env: `${keyName}=\n` });
	const { client, minted } = fakeClient();
	await runSandboxUse({
		client,
		org,
		query: "QA",
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write: () => {} }),
	});
	expect(minted).toEqual(["id_qa"]);
	expect(envOf(dir)).toContain(`${keyName}=am_sk_test_id_qa\n`);
});

test("--clear --json prints JSON", async () => {
	const dir = projectDir({ env: "AUTUMN_SANDBOX_ID=id_qa\n" });
	const { lines, write } = capture();
	await runSandboxUse({
		clear: true,
		json: true,
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});
	expect(JSON.parse(lines.join("")).cleared).toBe(true);
});

test("headless with no argument prints the table and the hint, writes nothing", async () => {
	const dir = projectDir();
	const { client, minted } = fakeClient();
	const { lines, write } = capture();

	const result = await runSandboxUse({
		client,
		org,
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(result).toBeNull();
	expect(minted).toEqual([]);
	expect(envOf(dir)).toBe("");
	const text = lines.join("");
	expect(text).toContain("Pricing v2");
	expect(text).toContain("id_pricing");
	expect(text).toContain("→ Which sandbox?");
	expect(text).toContain("atmn sandbox use <name|id>");
});

test("--json carries everything an agent needs, notes included", async () => {
	const dir = projectDir();
	const { client } = fakeClient();
	const { lines, write } = capture();

	await runSandboxUse({
		client,
		org,
		query: "QA",
		json: true,
		envDirs: [dir],
		prompter: createPrompter({ interactive: false, write }),
	});

	const parsed = JSON.parse(lines.join(""));
	expect(parsed.organization).toEqual(org);
	expect(parsed.sandbox).toEqual({ id: "id_qa", name: "QA", slug: "qa" });
	expect(parsed.keyName).toBe("AUTUMN_SANDBOX_ID_QA_SECRET_KEY");
	expect(parsed.keyMinted).toBe(true);
	expect(parsed.envPath).toBe(join(dir, ".env"));
	expect(Array.isArray(parsed.notes)).toBe(true);
	expect(parsed.notes.length).toBeGreaterThan(0);
});

test("an unknown name or id is refused before anything is written", async () => {
	const dir = projectDir();
	const { client, minted } = fakeClient();

	await expect(
		runSandboxUse({
			client,
			org,
			query: "nope",
			envDirs: [dir],
			prompter: createPrompter({ interactive: false, write: () => {} }),
		}),
	).rejects.toThrow(
		/No sandbox named or with id "nope"\. Run atmn sandbox list\./,
	);
	expect(minted).toEqual([]);
	expect(envOf(dir)).toBe("");
});
