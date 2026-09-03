#!/usr/bin/env node
import { Command } from "commander";
import { runLogin } from "./actions/login";
import { runPush } from "./actions/push";
import {
	requireSecretKey,
	resolveTarget,
	type TargetFlags,
} from "./env/resolveTarget";
import { createClient } from "./generated/client";
import { version } from "./version";

const NOT_IMPLEMENTED = (step: string) => () => {
	throw new Error(`Not implemented yet — lands in ${step}.`);
};

/**
 * Commander treats a lone `-v` as unknown, and `-V` as version. Rewriting the
 * token keeps `-v`, `-V` and `--version` identical without a custom parser.
 */
const normalizeVersionFlag = ({ argv }: { argv: string[] }): string[] =>
	argv.map((token) => (token === "-v" ? "--version" : token));

const withEnvironmentFlags = (command: Command): Command =>
	command
		.option("-p, --prod", "target production instead of sandbox")
		.option("--sandbox <sandboxId>", "target a specific sandbox")
		.option("-l, --local", "target a local server (default port 8080)")
		// Long-only: -p is prod.
		.option("--port <port>", "port for --local")
		.option("-b, --base-url <url>", "send to this URL instead");

export const buildProgram = (): Command => {
	const program = new Command();

	program
		.name("atmn-nightly")
		.description("Autumn CLI — nightly")
		.version(`atmn-nightly v${version}`, "-V, --version", "print the version")
		.showHelpAfterError();

	program
		.command("login")
		.description("authenticate and write org keys to your .env")
		.action(async () => {
			await runLogin();
		});

	withEnvironmentFlags(
		program
			.command("push")
			.description("apply autumn.config.ts to your catalog")
			.option("-y, --yes", "skip confirmation prompts")
			.option("-d, --dry-run", "preview without applying"),
	).action(async (options: TargetFlags & { dryRun?: boolean }) => {
		const target = resolveTarget(options);
		await runPush({
			client: createClient({
				secretKey: requireSecretKey({ target }),
				...(target.baseUrl ? { baseUrl: target.baseUrl } : {}),
			}),
			dryRun: options.dryRun === true,
		});
	});

	withEnvironmentFlags(
		program
			.command("pull")
			.description("write your remote catalog back into autumn.config.ts"),
	).action(NOT_IMPLEMENTED("3.2"));

	const sandbox = program
		.command("sandbox")
		.description("manage isolated sandboxes");
	sandbox
		.command("create")
		.description("mint a new sandbox and its key")
		.action(NOT_IMPLEMENTED("3.0"));

	return program;
};

export const run = async ({ argv }: { argv: string[] }): Promise<void> => {
	await buildProgram().parseAsync(normalizeVersionFlag({ argv }));
};

if (import.meta.main) {
	run({ argv: process.argv }).catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
}
