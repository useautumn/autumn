#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Command } from "commander";
import { runEnv } from "./actions/env";
import { fetchOrgInfo } from "./actions/env/fetchOrgInfo";
import { runInit } from "./actions/init/runInit";
import { runLogin } from "./actions/login";
import { runPull } from "./actions/pull";
import { runPush } from "./actions/push";
import { runReset } from "./actions/reset/runReset";
import { runSandboxCreate } from "./actions/sandbox/createSandbox";
import { runSandboxDelete } from "./actions/sandbox/deleteSandbox";
import { runSandboxList } from "./actions/sandbox/listSandboxes";
import { runSandboxUse } from "./actions/sandbox/useSandbox";
import { withSandboxScopeHint } from "./actions/sandbox/withSandboxScopeHint";
import {
	installSkills,
	linkSkills,
	printSkill,
	renderSkillsList,
	SKILLS_DIR_NAME,
	staleSkillsHint,
	updateSkills,
} from "./actions/skills/skills";
import { assertSandboxTarget } from "./env/assertSandboxTarget";
import { loadEnvFiles } from "./env/loadEnv";
import {
	managementTarget,
	requireSecretKey,
	resolveTarget,
	type Target,
	type TargetFlags,
	targetBaseUrl,
} from "./env/resolveTarget";
import type { CreateSandboxParams } from "./generated/client";
import { createClient } from "./generated/client";
import { type Project, resolveProject } from "./project/resolveProject";
import {
	createPrompter,
	NeedsInputError,
	type Prompter,
	releaseStdin,
} from "./prompt/prompt";
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
		.option("--client-id <id>", "OAuth client id the CLI identifies as")
		.option(
			"-c, --config <path>",
			"autumn.config.ts, or the folder holding it (default: found from cwd or the root package.json)",
		)
		.option(
			"--headless",
			"never prompt: print what a command needs and stop (default when not a TTY)",
		);

/**
 * Env first: the key and AUTUMN_BASE_URL usually live in a .env beside the
 * config, so reading them after building the client would never see them —
 * which is what the "put it in your .env" error message promises.
 */
const prepareTarget = ({ command }: { command: Command }): Target => {
	loadEnvFiles({ dirs: projectOf({ command }).envDirs });
	return resolveTarget(command.optsWithGlobals<TargetFlags>());
};

type GlobalFlags = TargetFlags & { config?: string; headless?: boolean };

const projectOf = ({ command }: { command: Command }): Project =>
	resolveProject({
		cwd: process.cwd(),
		configFlag: command.optsWithGlobals<GlobalFlags>().config,
	});

const configFlagOf = ({ command }: { command: Command }): string | undefined =>
	command.optsWithGlobals<GlobalFlags>().config;

const writeStaleSkillsHint = ({ command }: { command: Command }): void => {
	const stale = staleSkillsHint({
		dir: join(projectOf({ command }).configDir, SKILLS_DIR_NAME),
	});
	if (stale !== null) process.stdout.write(`${stale}\n`);
};

const PULL_EDIT_LINE = /^([+~-]) (\S+)$/;

/** `atmn pull` in a child, its edit lines read back. Only the pin travels:
 * init always pulls the main sandbox. */
const pullInChildProcess = ({
	configDir,
}: {
	configDir: string;
}): { appended: string[]; replaced: string[]; deleted: string[] } => {
	const result = spawnSync(
		process.execPath,
		[...process.execArgv, process.argv[1] ?? "", "--headless", "pull"],
		{
			cwd: configDir,
			env: { ...process.env, AUTUMN_SANDBOX_ID: "" },
			encoding: "utf8",
		},
	);
	if (result.status !== 0)
		throw new Error(`${result.stdout}${result.stderr}`.trim());
	const edits = {
		appended: [] as string[],
		replaced: [] as string[],
		deleted: [] as string[],
	};
	for (const raw of result.stdout.split("\n")) {
		const match = PULL_EDIT_LINE.exec(raw.trim());
		if (!match) continue;
		const [, symbol, id] = match;
		if (id === undefined) continue;
		if (symbol === "+") edits.appended.push(id);
		else if (symbol === "~") edits.replaced.push(id);
		else edits.deleted.push(id);
	}
	return edits;
};

/** `--headless` forces the hint path; a pipe or CI log gets it by default. */
const prompterFor = ({ command }: { command: Command }): Prompter =>
	createPrompter({
		interactive:
			command.optsWithGlobals<GlobalFlags>().headless !== true &&
			process.stdout.isTTY === true &&
			process.stdin.isTTY === true,
	});

const clientFor = ({ target }: { target: Target }) =>
	createClient({
		secretKey: requireSecretKey({ target }),
		...(target.baseUrl ? { baseUrl: target.baseUrl } : {}),
	});

/** `sandbox *` is an organization operation: never the sandbox's own key. */
const sandboxClientFor = ({ target }: { target: Target }) =>
	clientFor({ target: managementTarget({ target }) });

/** The pinned sandbox's name for the copy; nothing when the main key cannot list. */
const pinnedSandboxName = async ({
	target,
}: {
	target: Target;
}): Promise<{ sandboxName?: string }> => {
	if (target.sandboxId === undefined) return {};
	try {
		const { list } = await sandboxClientFor({ target }).listSandboxes({});
		const name = list.find((row) => row.id === target.sandboxId)?.name;
		return name === undefined ? {} : { sandboxName: name };
	} catch {
		return {};
	}
};

/** `/organization/me` for the main key: what `sandbox use` and `init` report the org as. */
const mainOrgInfo = ({ target }: { target: Target }) => {
	const main = managementTarget({ target });
	return fetchOrgInfo({
		baseUrl: targetBaseUrl({ target: main }),
		secretKey: requireSecretKey({ target: main }),
	});
};

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
		.command("init")
		.description(
			"set up this repo: log in, place the config, pull your catalog, install the skills",
		)
		.option("--path <dir>", "folder for the Autumn package (monorepos)")
		.option("--name <name>", "the package's name (monorepos)")
		.option("--login", "log in when no main sandbox key is on disk")
		.action(
			async (
				options: { path?: string; name?: string; login?: boolean },
				command: Command,
			) => {
				const flags = command.optsWithGlobals<GlobalFlags>();
				const baseUrl = targetBaseUrl({
					target: resolveTarget({ ...flags, sandbox: undefined }),
				});
				// Tests run the CLI from source, where the package is not published:
				// they point new packages at the checkout instead.
				const dependencySpec = process.env.ATMN_INIT_DEPENDENCY;
				await runInit({
					...(dependencySpec === undefined ? {} : { dependencySpec }),
					...(options.path === undefined ? {} : { path: options.path }),
					...(options.name === undefined ? {} : { name: options.name }),
					...(options.login === undefined ? {} : { login: options.login }),
					prompter: prompterFor({ command }),
					deps: {
						fetchOrgInfo: ({ secretKey }) =>
							fetchOrgInfo({ baseUrl, secretKey }),
						login: ({ envDirs }) =>
							runLogin({
								cwd: envDirs[0],
								target: resolveTarget({ ...flags, sandbox: undefined }),
							}),
						install: async ({ manager, repoRoot }) =>
							spawnSync(manager, ["install"], {
								cwd: repoRoot,
								stdio: "inherit",
							}).status === 0,
						// A fresh process: the config imports a package that was
						// installed a moment ago, which this process cannot resolve.
						pull: async ({ configDir }) => pullInChildProcess({ configDir }),
					},
				});
			},
		);

	program
		.command("login")
		.description("authenticate and write org keys to your .env")
		.action(async (_options: unknown, command: Command) => {
			await runLogin({
				target: prepareTarget({ command }),
				configPath: configFlagOf({ command }),
			});
		});

	program
		.command("env")
		.description("show the org, environment and key your commands target")
		.option("--json", "print the response instead of the summary")
		.action(async (options: { json?: boolean }, command: Command) => {
			const target = prepareTarget({ command });
			await runEnv({
				target,
				fetchOrgInfo: () =>
					fetchOrgInfo({
						baseUrl: targetBaseUrl({ target }),
						secretKey: requireSecretKey({ target }),
					}),
				json: options.json === true,
			});
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
					configPath: configFlagOf({ command }),
					dryRun: !apply,
				});
				if (!apply && !previewIsEmpty({ preview: result.preview }))
					process.stdout.write(
						options.dryRun === true
							? "\nDry run — nothing applied.\n"
							: "\nNothing applied. Re-run with --yes to apply these changes.\n",
					);
				writeStaleSkillsHint({ command });
			},
		);

	const skills = program
		.command("skills")
		.description("the skills this CLI carries: list, print, install, update")
		.argument("[name]", "print this skill's SKILL.md")
		.option("--ref <path>", "print one of the skill's references instead")
		.option("--json", "print the skill as JSON")
		.action(
			(name: string | undefined, options: { ref?: string; json?: boolean }) => {
				if (name === undefined) {
					process.stdout.write(`${renderSkillsList()}\n`);
					return;
				}
				printSkill({
					name,
					...(options.ref === undefined ? {} : { ref: options.ref }),
					json: options.json === true,
					write: (text) => process.stdout.write(text),
				});
			},
		);

	skills
		.command("install")
		.description(
			"write the skills next to your config; --link runs npx skills add",
		)
		.option("--dir <dir>", "write here instead of <config folder>/skills")
		.option("--link", "run `npx skills add <dir> --all` afterwards")
		.action(
			async (options: { dir?: string; link?: boolean }, command: Command) => {
				const dir =
					options.dir ??
					join(projectOf({ command }).configDir, SKILLS_DIR_NAME);
				installSkills({ dir, write: (text) => process.stdout.write(text) });
				if (options.link === true)
					await linkSkills({
						dir,
						write: (text) => process.stdout.write(text),
					});
			},
		);

	skills
		.command("update")
		.description("rewrite installed skills older than this CLI's")
		.option(
			"--dir <dir>",
			"the install to update; <config folder>/skills by default",
		)
		.action((options: { dir?: string }, command: Command) => {
			const dir =
				options.dir ?? join(projectOf({ command }).configDir, SKILLS_DIR_NAME);
			updateSkills({ dir, write: (text) => process.stdout.write(text) });
		});

	program
		.command("pull")
		.description("write your remote catalog back into autumn.config.ts")
		.option("--include-mappings", "keep processor mappings in pulled fixtures")
		.action(
			async (options: { includeMappings?: boolean }, command: Command) => {
				const target = prepareTarget({ command });
				await runPull({
					client: clientFor({ target }),
					configPath: configFlagOf({ command }),
					includeMappings: options.includeMappings === true,
				});
				writeStaleSkillsHint({ command });
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
					...(await pinnedSandboxName({ target })),
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
		.command("use")
		.description(
			"target a sandbox by name or id; --clear returns to the main one",
		)
		.argument("[query]", "the sandbox's name or id")
		.option("--clear", "drop the pin so commands target the main sandbox")
		.option("--json", "print the result as JSON")
		.action(
			async (
				query: string | undefined,
				options: { clear?: boolean; json?: boolean },
				command: Command,
			) => {
				const target = prepareTarget({ command });
				try {
					await runSandboxUse({
						client: sandboxClientFor({ target }),
						org: await mainOrgInfo({ target }),
						...(query === undefined ? {} : { query }),
						clear: options.clear === true,
						json: options.json === true,
						envDirs: projectOf({ command }).envDirs,
						prompter: prompterFor({ command }),
					});
				} catch (error) {
					throw withSandboxScopeHint({ error });
				}
			},
		);

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
						envDirs: projectOf({ command }).envDirs,
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
						envDirs: projectOf({ command }).envDirs,
					});
				} catch (error) {
					throw withSandboxScopeHint({ error });
				}
			},
		);

	return program;
};

export const run = async ({ argv }: { argv: string[] }): Promise<void> => {
	try {
		await buildProgram().parseAsync(normalizeVersionFlag({ argv }));
	} catch (error) {
		// A headless run stopping at a prompt has already printed what it
		// needs; that is a normal end, not a failure.
		if (error instanceof NeedsInputError) return;
		throw error;
	} finally {
		releaseStdin();
	}
};

if (import.meta.main) {
	run({ argv: process.argv }).catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
}
