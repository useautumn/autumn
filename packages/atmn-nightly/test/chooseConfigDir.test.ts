/**
 * A first pull never scaffolds into cwd unasked. With no `-c`, no config
 * beside cwd and no root marker, it asks where the config should live:
 *   - single repo   → default is cwd
 *   - workspace root → default is packages/autumn, and the root marker is written
 *   - headless      → the `-c` hint is printed and nothing is written
 */

import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import type { AutumnClient } from "../src/generated/client";
import { createPrompter, NeedsInputError } from "../src/prompt/prompt";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const repo = ({ workspaces }: { workspaces: boolean }): string => {
	const root = mkdtempSync(join(tmpdir(), "atmn-first-pull-"));
	dirs.push(root);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify(
			{ name: "app", ...(workspaces ? { workspaces: ["packages/*"] } : {}) },
			null,
			"\t",
		),
	);
	return root;
};

const client = {
	previewUpdateOrganization: async () => ({ config: { changes: [] } }),
	diff: async () => ({
		features: [{ featureId: "seats", action: "delete" }],
		plans: [],
	}),
	get: async () => ({
		features: [
			{ id: "seats", name: "Seats", type: "boolean", archived: false },
		],
		plans: [],
	}),
} as unknown as AutumnClient;

const imports = {
	atmn: `${import.meta.dir}/../src/generated/wire`,
	builders: `${import.meta.dir}/../src/generated/features`,
};

const terminal = ({ answer }: { answer: string }) => {
	let output = "";
	const prompter = createPrompter({
		interactive: true,
		write: (text) => {
			output += text;
		},
		readLine: async () => answer,
	});
	return { prompter, output: () => output };
};

test("single repo: Enter keeps the config beside cwd, no marker", async () => {
	const root = repo({ workspaces: false });
	const { prompter } = terminal({ answer: "" });

	const result = await runPull({
		client,
		cwd: root,
		write: () => {},
		imports,
		prompter,
	});

	expect(result.configPath).toBe(join(root, "autumn.config.ts"));
	expect(readFileSync(join(root, "features.ts"), "utf8")).toContain(
		'featureId: "seats"',
	);
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(manifest.atmn).toBeUndefined();
});

test("workspace root: Enter picks packages/autumn and writes the root marker", async () => {
	const root = repo({ workspaces: true });
	const { prompter } = terminal({ answer: "" });

	const result = await runPull({
		client,
		cwd: root,
		write: () => {},
		imports,
		prompter,
	});

	const configDir = join(root, "packages/autumn");
	expect(result.configPath).toBe(join(configDir, "autumn.config.ts"));
	expect(existsSync(join(root, "features.ts"))).toBe(false);
	expect(readFileSync(join(configDir, "features.ts"), "utf8")).toContain(
		'featureId: "seats"',
	);
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(manifest.atmn).toEqual({ config: "packages/autumn/autumn.config.ts" });
	expect(manifest.scripts.atmn).toContain(
		'-c "packages/autumn/autumn.config.ts"',
	);
});

test("a typed folder wins over the default", async () => {
	const root = repo({ workspaces: true });
	const { prompter } = terminal({ answer: "billing/autumn" });

	const result = await runPull({
		client,
		cwd: root,
		write: () => {},
		imports,
		prompter,
	});

	expect(result.configPath).toBe(join(root, "billing/autumn/autumn.config.ts"));
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(manifest.atmn).toEqual({ config: "billing/autumn/autumn.config.ts" });
});

test("the marker makes the next pull land on the chosen folder from the root", async () => {
	const root = repo({ workspaces: true });
	await runPull({
		client,
		cwd: root,
		write: () => {},
		imports,
		prompter: terminal({ answer: "" }).prompter,
	});

	let output = "";
	// Headless now: the marker answers the question, so nothing is asked.
	const second = await runPull({
		client,
		cwd: root,
		write: (text) => {
			output += text;
		},
		imports,
	});

	expect(second.configPath).toBe(
		join(root, "packages/autumn/autumn.config.ts"),
	);
	expect(output).not.toContain("Where should");
	expect(existsSync(join(root, "autumn.config.ts"))).toBe(false);
});

test("headless with no config: the -c hint is printed and nothing is written", async () => {
	const root = repo({ workspaces: true });
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/app.ts"), "export const app = 1;\n");
	let output = "";

	await expect(
		runPull({
			client,
			cwd: root,
			write: (text) => {
				output += text;
			},
			imports,
		}),
	).rejects.toBeInstanceOf(NeedsInputError);

	expect(output).toContain("Where should your Autumn config live?");
	expect(output).toContain("-c packages/autumn");
	expect(existsSync(join(root, "autumn.config.ts"))).toBe(false);
	expect(existsSync(join(root, "packages"))).toBe(false);
	expect(readFileSync(join(root, "src/app.ts"), "utf8")).toBe(
		"export const app = 1;\n",
	);
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	expect(manifest.atmn).toBeUndefined();
});

test("-c names the folder outright, so nothing is asked", async () => {
	const root = repo({ workspaces: true });
	let output = "";

	const result = await runPull({
		client,
		cwd: root,
		configPath: "packages/pricing",
		write: (text) => {
			output += text;
		},
		imports,
	});

	expect(result.configPath).toBe(
		join(root, "packages/pricing/autumn.config.ts"),
	);
	expect(output).not.toContain("Where should");
});
