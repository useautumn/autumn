#!/usr/bin/env node
import { Command } from "commander";
import { runPush } from "./actions/push";
import { createClient } from "./generated/client";
import { version } from "./version";

const NOT_IMPLEMENTED = (step: string) => () => {
	throw new Error(`Not implemented yet — lands in ${step}.`);
};

/**
 * Sandbox unless --prod, matching the two keys people already have. Multi
 * sandbox selection is still to be designed.
 */
const requireSecretKey = ({ prod }: { prod?: boolean }): string => {
	const name = prod ? "AUTUMN_PROD_SECRET_KEY" : "AUTUMN_SECRET_KEY";
	const key = process.env[name];
	if (!key) {
		throw new Error(
			`${name} is not set. Put it in your .env, or export it before running.`,
		);
	}
	return key;
};

/**
 * Commander treats a lone `-v` as unknown, and `-V` as version. Rewriting the
 * token keeps `-v`, `-V` and `--version` identical without a custom parser.
 */
const normalizeVersionFlag = ({ argv }: { argv: string[] }): string[] =>
	argv.map((token) => (token === "-v" ? "--version" : token));

const withEnvironmentFlags = (command: Command): Command =>
	command
		.option("--prod", "target production instead of sandbox")
		.option("--sandbox <sandboxId>", "target a specific sandbox");

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
		.action(NOT_IMPLEMENTED("3.0"));

	withEnvironmentFlags(
		program
			.command("push")
			.description("apply autumn.config.ts to your catalog")
			.option("-y, --yes", "skip confirmation prompts")
			.option("-d, --dry-run", "preview without applying"),
	).action(async (options: { prod?: boolean; dryRun?: boolean }) => {
		await runPush({
			client: createClient({ secretKey: requireSecretKey(options) }),
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
