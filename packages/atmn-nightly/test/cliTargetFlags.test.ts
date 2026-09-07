/**
 * The global target flags are documented as working before or after the
 * command. The resolver tests call `resolveTarget` directly and would keep
 * passing through a Commander misconfiguration, so these parse for real.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Command } from "commander";
import { buildProgram } from "../src/cli";
import {
	resolveTarget,
	type Target,
	type TargetFlags,
} from "../src/env/resolveTarget";

const CLEARED = [
	"AUTUMN_BASE_URL",
	"AUTUMN_SANDBOX_ID",
	"AUTUMN_CLIENT_ID",
	"ATMN_CLI_CLIENT_ID",
] as const;

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

/** The real program, with push's action swapped for a capture so parsing
 * neither reads a .env nor builds a client. */
const targetFor = async ({ argv }: { argv: string[] }): Promise<Target> => {
	const program = buildProgram();
	const push = program.commands.find((command) => command.name() === "push");
	if (push === undefined) throw new Error("the push command is gone");

	let resolved: Target | undefined;
	push.action((_options: unknown, command: Command) => {
		resolved = resolveTarget(command.optsWithGlobals<TargetFlags>());
	});
	await program.parseAsync(argv, { from: "user" });

	if (resolved === undefined) throw new Error("the push action never ran");
	return resolved;
};

test("--local reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--local", "push"] });
	const after = await targetFor({ argv: ["push", "--local"] });

	expect(before.baseUrl).toBe("http://localhost:8080");
	expect(after).toEqual(before);
});

test("--port reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--port", "3001", "push"] });
	const after = await targetFor({ argv: ["push", "--port", "3001"] });

	expect(before.baseUrl).toBe("http://localhost:3001");
	expect(after).toEqual(before);
});

test("--prod reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--prod", "push"] });
	const after = await targetFor({ argv: ["push", "--prod"] });

	expect(before.secretKeyName).toBe("AUTUMN_PROD_SECRET_KEY");
	expect(after).toEqual(before);
});

test("--sandbox selects that sandbox's own key, not the org's", async () => {
	// The flag is not dropped on the way through: it picks the key variable
	// `atmn sandbox create` wrote for that sandbox.
	const before = await targetFor({ argv: ["--sandbox", "sb_1", "push"] });
	const after = await targetFor({ argv: ["push", "--sandbox", "sb_1"] });

	expect(before.secretKeyName).toBe("AUTUMN_SANDBOX_SB_1_SECRET_KEY");
	expect(before.sandboxId).toBe("sb_1");
	expect(after).toEqual(before);
});

test("the short forms travel the same way", async () => {
	expect(await targetFor({ argv: ["-l", "push"] })).toEqual(
		await targetFor({ argv: ["push", "-l"] }),
	);
	expect(
		(await targetFor({ argv: ["-b", "https://example.com", "push"] })).baseUrl,
	).toBe("https://example.com");
});
