import type { Command } from "commander";
import { buildProgram } from "../../src/cli";
import {
	resolveTarget,
	type Target,
	type TargetFlags,
} from "../../src/env/resolveTarget";

const CLEARED = [
	"AUTUMN_BASE_URL",
	"AUTUMN_SANDBOX_ID",
	"AUTUMN_CLIENT_ID",
	"ATMN_CLI_CLIENT_ID",
] as const;

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
