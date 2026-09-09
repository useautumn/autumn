/**
 * `atmn env` never touches the network here: the org lookup is injected. What
 * is under test is that the command reports the target every other command
 * resolves — so `-p` shows the production key, a pin shows its sandbox — and
 * that the global flags reach it from either side of the command name.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { runEnv } from "../src/actions/env";
import type { OrgInfo } from "../src/actions/env/types/orgInfo";
import { resolveTarget } from "../src/env/resolveTarget";
import { renderEnv } from "../src/render/renderEnv";
import { isolateTargetEnv, targetFor } from "./helpers/targetFor";

const env = isolateTargetEnv();
beforeEach(env.clear);
afterEach(env.restore);

const ORG: OrgInfo = {
	id: "org_123",
	name: "Acme",
	slug: "acme",
	env: "live",
	user: { id: "user_1", email: "dev@example.com", name: "Dev" },
};

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

test("reports the production key when the target is --prod", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({ prod: true }),
		fetchOrgInfo: async () => ORG,
		write,
	});

	const output = lines.join("");
	expect(output).toContain("Acme");
	expect(output).toContain("(acme)");
	expect(output).toContain("Production");
	expect(output).toContain("AUTUMN_PROD_SECRET_KEY");
	expect(output).toContain("dev@example.com");
	expect(output).not.toContain("Server");
});

test("names the pinned sandbox and a non-default server", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({ sandbox: "sb_1", local: true }),
		// A sandbox key authenticates as the sandbox's own org.
		fetchOrgInfo: async () => ({ ...ORG, id: "sb_1", env: "sandbox" }),
		write,
	});

	const output = lines.join("");
	expect(output).toContain("Sandbox");
	expect(output).toContain("sb_1");
	expect(output).not.toContain("key belongs to");
	expect(output).toContain("AUTUMN_SANDBOX_SB_1_SECRET_KEY");
	expect(output).toContain("http://localhost:8080");
});

test("flags a pinned sandbox whose key answers as another org", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({ sandbox: "sb_1" }),
		fetchOrgInfo: async () => ({ ...ORG, id: "sb_other", env: "sandbox" }),
		write,
	});

	expect(lines.join("")).toContain("sb_1 ← key belongs to sb_other");
});

test("strips terminal controls from every server-provided string", () => {
	const output = renderEnv({
		info: {
			...ORG,
			name: "Acme\u001b[2J",
			slug: "acme\u001b]0;x\u0007",
			user: { id: "u", email: "dev@example.com\u001b[2J", name: "Dev" },
		},
		secretKeyName: "AUTUMN_SECRET_KEY",
	});
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the test
	expect(output.replace(/\u001b\[[0-9;]*m/g, "")).not.toMatch(/\u001b|\u0007/);
});

test("--json prints the org, whether the key is the main one, the pin, and notes", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({}),
		fetchOrgInfo: async () => ORG,
		json: true,
		write,
	});

	const parsed = JSON.parse(lines.join(""));
	expect(parsed.organization).toEqual({
		id: ORG.id,
		name: ORG.name,
		slug: ORG.slug,
	});
	expect(parsed.env).toBe(ORG.env);
	expect(parsed.isMaster).toBe(true);
	expect(parsed.sandbox).toBeNull();
	expect(parsed.keyName).toBe("AUTUMN_SECRET_KEY");
	expect(parsed.notes.length).toBeGreaterThan(0);
});

test("--json under a pin reports the sandbox and which org the key answered as", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({ sandbox: "sb_1" }),
		fetchOrgInfo: async () => ({ ...ORG, id: "sb_1", is_sandbox: true }),
		json: true,
		write,
	});
	const parsed = JSON.parse(lines.join(""));
	expect(parsed.sandbox).toEqual({ id: "sb_1", authenticatedAs: "sb_1" });
	expect(parsed.isMaster).toBe(false);
	expect(parsed.keyName).toBe("AUTUMN_SANDBOX_SB_1_SECRET_KEY");
	expect(parsed.notes.length).toBeGreaterThan(0);
});

test("renderEnv lines every value up in one column", () => {
	const output = renderEnv({
		info: ORG,
		secretKeyName: "AUTUMN_SECRET_KEY",
	});
	const starts = [
		["Acme", 0],
		["Production", 1],
		["dev@example.com", 2],
		["AUTUMN_SECRET_KEY", 3],
	].map(([value, line]) =>
		output.split("\n")[line as number]?.indexOf(value as string),
	);
	for (const start of starts) expect(start).toBeGreaterThanOrEqual(0);
	expect(new Set(starts).size).toBe(1);
});

test("--prod reaches env from either side of the command", async () => {
	const before = await targetFor({ command: "env", argv: ["-p", "env"] });
	const after = await targetFor({ command: "env", argv: ["env", "-p"] });

	expect(before.secretKeyName).toBe("AUTUMN_PROD_SECRET_KEY");
	expect(after).toEqual(before);
});
