#!/usr/bin/env node
import { Command } from "commander";
import { runLogin } from "./actions/login";
import { runPull } from "./actions/pull";
import { configSearchDirs, runPush } from "./actions/push";
import { runReset } from "./actions/reset/runReset";
import { runSandboxCreate } from "./actions/sandbox/createSandbox";
import { runSandboxDelete } from "./actions/sandbox/deleteSandbox";
import { runSandboxList } from "./actions/sandbox/listSandboxes";
import { withSandboxScopeHint } from "./actions/sandbox/withSandboxScopeHint";
import { assertSandboxTarget } from "./env/assertSandboxTarget";
import { loadEnvFiles } from "./env/loadEnv";
import {
	managementTarget,
	requireSecretKey,
	resolveTarget,
	type Target,
	type TargetFlags,
} from "./env/resolveTarget";
import type { CreateSandboxParams } from "./generated/client";
import { createClient } from "./generated/client";
import { previewIsEmpty } from "./render/renderPreview";
import { version } from "./version";

/**
 * Commander treats a lone `-v` as unknown, and `-V` as version. Rewriting the
 * token keeps `-v`, `-V` and `--version` identical without a custom parser.
 */
const normalizeVersionFlag = ({ argv }: { argv: string[] }): string[] =>
	argv.map((token) => (token === "-v" ? "--version" : token));

/** The flags every command shares: where to send, which key, who the CLI is. */
const withTargetFlags = (program: Command): Command =>
	program
		.option("-p, --prod", "target production instead of sandbox")
		.option("--sandbox <sandboxId>", "target a specific sandbox")
		.option("-l, --local", "target a local server (default port 8080)")
		// Long-only: -p is prod.
		.option("--port <port>", "port of a local server (implies --local)")
		.option("-b, --base-url <url>", "send to this URL instead")
		.option("--client-id <id>", "OAuth client id the CLI identifies as");

/**
 * Env first: the key and AUTUMN_BASE_URL usually live in a .env beside the
 * config, so reading them after building the client would never see them —
 * which is what the "put it in your .env" error message promises.
 */
const prepareTarget = ({ command }: { command: Command }): Target => {
	loadEnvFiles({ dirs: configSearchDirs({ cwd: process.cwd() }) });
	return resolveTarget(command.optsWithGlobals<TargetFlags>());
};

const clientFor = ({ target }: { target: Target }) =>
	createClient({
		secretKey: requireSecretKey({ target }),
		...(target.baseUrl ? { baseUrl: target.baseUrl } : {}),
	});

/** `sandbox *` is an organization operation: never the sandbox's own key. */
const sandboxClientFor = ({ target }: { target: Target }) =>
	clientFor({ target: managementTarget({ target }) });

export const buildProgram = (): Command => {
	const program = new Command();

	withTargetFlags(
		program
			.name("atmn-nightly")
			.description("Autumn CLI — nightly")
			.version(`atmn-nightly v${version}`, "-V, --version", "print the version")
			.showHelpAfterError(),
	);

	program
		.command("login")
		.description("authenticate and write org keys to your .env")
		.action(async (_options: unknown, command: Command) => {
			await runLogin({ target: prepareTarget({ command }) });
		});

	program
		.command("push")
		.description(
			"preview autumn.config.ts against your catalog; --yes applies it",
		)
		.option("-y, --yes", "apply the changes the preview shows")
		.option("-d, --dry-run", "preview only, even with --yes")
		.action(
			async (
				options: { dryRun?: boolean; yes?: boolean },
				command: Command,
			) => {
				const target = prepareTarget({ command });
				// Nothing is applied unless asked: a plain push is the preview, and the
				// same command with --yes is the write. Deletions ride the same gate.
				const apply = options.yes === true && options.dryRun !== true;
				const result = await runPush({
					client: clientFor({ target }),
					dryRun: !apply,
				});
				if (apply || previewIsEmpty({ preview: result.preview })) return;
				process.stdout.write(
					options.dryRun === true
						? "\nDry run — nothing applied.\n"
						: "\nNothing applied. Re-run with --yes to apply these changes.\n",
				);
			},
		);

	program
		.command("pull")
		.description("write your remote catalog back into autumn.config.ts")
		.option("--include-mappings", "keep processor mappings in pulled fixtures")
		.action(
			async (options: { includeMappings?: boolean }, command: Command) => {
				const target = prepareTarget({ command });
				await runPull({
					client: clientFor({ target }),
					includeMappings: options.includeMappings === true,
				});
			},
		);

	program
		.command("reset")
		.description("wipe this sandbox's catalog and customers; --yes applies it")
		.option("-y, --yes", "wipe it")
		.action(async (options: { yes?: boolean }, command: Command) => {
			const target = prepareTarget({ command });
			// Ahead of the client: --prod would otherwise fail on a missing prod
			// key rather than on the refusal that matters.
			assertSandboxTarget({ target });
			try {
				await runReset({
					client: clientFor({ target }),
					target,
					yes: options.yes === true,
				});
			} catch (error) {
				throw withSandboxScopeHint({ error });
			}
		});

	const sandbox = program
		.command("sandbox")
		.description("manage isolated sandboxes");

	sandbox
		.command("list")
		.description("show your sandboxes, newest first")
		.option("--json", "print the response instead of the table")
		.action(async (options: { json?: boolean }, command: Command) => {
			const target = prepareTarget({ command });
			await runSandboxList({
				client: sandboxClientFor({ target }),
				...(target.sandboxId === undefined
					? {}
					: { currentSandboxId: target.sandboxId }),
				json: options.json === true,
			});
		});

	sandbox
		.command("create")
		.description("mint a sandbox and write its key to your .env")
		.argument("<name>", "name for the sandbox")
		.option("--color <color>", "colour the dashboard labels it with")
		.option("--icon <icon>", "icon the dashboard labels it with")
		.option("--use", "pin AUTUMN_SANDBOX_ID so later commands target it")
		.option("--json", "print the response instead of the summary")
		.action(
			async (
				name: string,
				options: {
					color?: string;
					icon?: string;
					use?: boolean;
					json?: boolean;
				},
				command: Command,
			) => {
				const target = prepareTarget({ command });
				try {
					await runSandboxCreate({
						client: sandboxClientFor({ target }),
						name,
						// The palette lives in the spec; an unknown colour is the
						// server's error to give, not a list the CLI keeps in sync.
						...(options.color === undefined
							? {}
							: { color: options.color as CreateSandboxParams["color"] }),
						...(options.icon === undefined ? {} : { icon: options.icon }),
						use: options.use === true,
						json: options.json === true,
						envDirs: configSearchDirs({ cwd: process.cwd() }),
					});
				} catch (error) {
					throw withSandboxScopeHint({ error });
				}
			},
		);

	sandbox
		.command("delete")
		.description("delete a sandbox and drop its key from your .env")
		.argument("<id>", "id of the sandbox to delete")
		.option("-y, --yes", "delete it, catalog and customers included")
		.action(
			async (id: string, options: { yes?: boolean }, command: Command) => {
				const target = prepareTarget({ command });
				try {
					await runSandboxDelete({
						client: sandboxClientFor({ target }),
						id,
						yes: options.yes === true,
						envDirs: configSearchDirs({ cwd: process.cwd() }),
					});
				} catch (error) {
					throw withSandboxScopeHint({ error });
				}
			},
		);

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
