/**
 * `atmn env` never touches the network here: the org lookup is injected. What
 * is under test is that the command reports the target every other command
 * resolves — so `-p` shows the production key, a pin shows its sandbox — and
 * that the global flags reach it from either side of the command name.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Command } from "commander";
import { runEnv } from "../src/actions/env";
import type { OrgInfo } from "../src/actions/env/types/orgInfo";
import { buildProgram } from "../src/cli";
import {
	resolveTarget,
	type Target,
	type TargetFlags,
} from "../src/env/resolveTarget";
import { renderEnv } from "../src/render/renderEnv";

const CLEARED = ["AUTUMN_BASE_URL", "AUTUMN_SANDBOX_ID"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
	for (const key of CLEARED) {
		saved.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterEach(() => {
	for (const [key, value] of saved) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	saved.clear();
});

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
		fetchOrgInfo: async () => ({ ...ORG, env: "sandbox" }),
		write,
	});

	const output = lines.join("");
	expect(output).toContain("Sandbox");
	expect(output).toContain("sb_1");
	expect(output).toContain("AUTUMN_SANDBOX_SB_1_SECRET_KEY");
	expect(output).toContain("http://localhost:8080");
});

test("--json prints the response verbatim", async () => {
	const { lines, write } = capture();
	await runEnv({
		target: resolveTarget({}),
		fetchOrgInfo: async () => ORG,
		json: true,
		write,
	});

	expect(JSON.parse(lines.join(""))).toEqual(ORG);
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
	expect(new Set(starts).size).toBe(1);
});

/** The real program, with env's action swapped for a capture so parsing
 * neither reads a .env nor calls the server. */
const targetFor = async ({ argv }: { argv: string[] }): Promise<Target> => {
	const program = buildProgram();
	const env = program.commands.find((command) => command.name() === "env");
	if (env === undefined) throw new Error("the env command is gone");

	let resolved: Target | undefined;
	env.action((_options: unknown, command: Command) => {
		resolved = resolveTarget(command.optsWithGlobals<TargetFlags>());
	});
	await program.parseAsync(argv, { from: "user" });

	if (resolved === undefined) throw new Error("the env action never ran");
	return resolved;
};

test("--prod reaches env from either side of the command", async () => {
	const before = await targetFor({ argv: ["-p", "env"] });
	const after = await targetFor({ argv: ["env", "-p"] });

	expect(before.secretKeyName).toBe("AUTUMN_PROD_SECRET_KEY");
	expect(after).toEqual(before);
});
