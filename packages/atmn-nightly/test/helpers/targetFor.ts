import type { Command } from "commander";
import { buildProgram } from "../../src/cli";
import {
	resolveTarget,
	type Target,
	type TargetFlags,
} from "../../src/env/resolveTarget";

/** Env vars the resolver reads; cleared so a developer's own .env stays out of the assertions. */
const CLEARED = [
	"AUTUMN_BASE_URL",
	"AUTUMN_SANDBOX_ID",
	"AUTUMN_CLIENT_ID",
	"ATMN_CLI_CLIENT_ID",
] as const;

/** Clears the resolver's env vars for a test file; returns the restore for afterEach. */
export const isolateTargetEnv = () => {
	const saved = new Map<string, string | undefined>();
	return {
		clear: () => {
			for (const key of CLEARED) {
				saved.set(key, process.env[key]);
				delete process.env[key];
			}
		},
		restore: () => {
			for (const [key, value] of saved) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			saved.clear();
		},
	};
};

/** The real program, with one command's action swapped for a capture so parsing
 * neither reads a .env nor talks to a server. */
export const targetFor = async ({
	command: name,
	argv,
}: {
	command: string;
	argv: string[];
}): Promise<Target> => {
	const program = buildProgram();
	const found = program.commands.find((command) => command.name() === name);
	if (found === undefined) throw new Error(`the ${name} command is gone`);

	let resolved: Target | undefined;
	found.action((_options: unknown, command: Command) => {
		resolved = resolveTarget(command.optsWithGlobals<TargetFlags>());
	});
	await program.parseAsync(argv, { from: "user" });

	if (resolved === undefined) throw new Error(`the ${name} action never ran`);
	return resolved;
};
