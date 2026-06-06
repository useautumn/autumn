import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

const defaultSlackScopes = [
	"app_mentions:read",
	"assistant:write",
	"channels:history",
	"channels:read",
	"chat:write",
	"groups:history",
	"groups:read",
	"im:history",
	"im:read",
	"im:write",
	"mpim:history",
	"mpim:read",
	"users:read",
];

const defaultBotEvents = [
	"app_mention",
	"message.channels",
	"message.groups",
	"message.im",
	"message.mpim",
];

type Args = {
	action?: string;
	appName?: string;
	baseUrl?: string;
	dryRun: boolean;
	envFile?: string;
	help: boolean;
	printManifest: boolean;
	provider?: SlackInstallProvider;
	scopes: string[];
	teamId?: string;
};

type SlackInstallProvider = "slack" | "slack_admin";

type SlackManifest = {
	display_information: {
		name: string;
	};
	features: {
		app_home: {
			home_tab_enabled: boolean;
			messages_tab_enabled: boolean;
			messages_tab_read_only_enabled: boolean;
		};
		bot_user: {
			display_name: string;
			always_online: boolean;
		};
	};
	oauth_config: {
		redirect_urls: string[];
		scopes: {
			bot: string[];
		};
	};
	settings: {
		event_subscriptions: {
			request_url: string;
			bot_events: string[];
		};
		interactivity: {
			is_enabled: boolean;
			request_url: string;
		};
		org_deploy_enabled: boolean;
		socket_mode_enabled: boolean;
		token_rotation_enabled: boolean;
	};
};

type SlackManifestCreateResponse = {
	ok: boolean;
	error?: string;
	errors?: unknown[];
	app_id?: string;
	credentials?: {
		client_id?: string;
		client_secret?: string;
		signing_secret?: string;
		verification_token?: string;
	};
	oauth_authorize_url?: string;
	[key: string]: unknown;
};

type SlackApiResponse = {
	ok: boolean;
	error?: string;
	[key: string]: unknown;
};

const usage = () =>
	[
		"Usage:",
		"  bun slack [setup-bot] [options]",
		"",
		"Options:",
		"  --base-url <url>           Public Leaf URL. Defaults to NGROK_URL, SLACK_BOT_URL, or CHAT_URL.",
		"  --name <name>              Slack app name. Defaults to Autumn Chat Local.",
		"  --env-file <path>          Write Slack env vars to this file.",
		"  --provider <provider>      slack or slack_admin. Defaults to prompt for setup-bot.",
		"  --scopes <csv>             Override bot scopes.",
		"  --team-id <id>             Workspace team id for org-scoped Slack CLI auth.",
		"  --print-manifest           Print generated Slack app manifest.",
		"  --dry-run                  Print manifest/env without calling Slack.",
		"  --help                     Show this help.",
		"",
		"Example:",
		"  bun slack",
		"  bun slack --provider slack_admin",
		"  bun slack --base-url https://j.dev.useautumn.com --env-file .env.slack-local",
	].join("\n");

const readOption = ({
	args,
	name,
}: {
	args: string[];
	name: string;
}): string | undefined => {
	const inline = args.find((arg) => arg.startsWith(`${name}=`));
	if (inline) return inline.slice(name.length + 1);

	const index = args.indexOf(name);
	if (index === -1) return undefined;
	return args[index + 1];
};

const parseArgs = ({ argv }: { argv: string[] }): Args => {
	const action = argv[0]?.startsWith("--")
		? "setup-bot"
		: (argv[0] ?? "setup-bot");
	const scopes = readOption({ args: argv, name: "--scopes" });
	const providerArg = readOption({ args: argv, name: "--provider" });
	const provider =
		providerArg === "slack" || providerArg === "slack_admin"
			? providerArg
			: action === "setup-admin-bot"
				? "slack_admin"
				: action === "setup-local-bot" || action === "setup-regular-bot"
					? "slack"
					: undefined;
	const defaultAppName =
		provider === "slack_admin"
			? process.env.SLACK_ADMIN_APP_NAME
			: process.env.SLACK_APP_NAME;

	return {
		action,
		appName: readOption({ args: argv, name: "--name" }) ?? defaultAppName,
		baseUrl:
			readOption({ args: argv, name: "--base-url" }) ??
			process.env.NGROK_URL ??
			process.env.SLACK_BOT_URL ??
			process.env.CHAT_URL,
		dryRun: argv.includes("--dry-run"),
		envFile: readOption({ args: argv, name: "--env-file" }),
		help: argv.includes("--help") || argv.includes("-h"),
		printManifest: argv.includes("--print-manifest"),
		provider,
		scopes: scopes
			? scopes.split(",").map((scope) => scope.trim())
			: defaultSlackScopes,
		teamId: readOption({ args: argv, name: "--team-id" }),
	};
};

const trimTrailingSlash = ({ url }: { url: string }) => url.replace(/\/+$/, "");

const defaultAppNameForProvider = ({
	provider,
}: {
	provider: SlackInstallProvider;
}) =>
	provider === "slack_admin" ? "Autumn Chat Admin Local" : "Autumn Chat Local";

const isUrl = ({ value }: { value: string }) => {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
};

const resolveInteractiveArgs = async ({
	args,
}: {
	args: Args;
}): Promise<Args & { provider: SlackInstallProvider }> => {
	const answers = await inquirer.prompt<{
		provider?: SlackInstallProvider;
		appName?: string;
		baseUrl?: string;
		envFile?: string;
	}>([
		...(!args.provider
			? [
					{
						type: "list" as const,
						name: "provider" as const,
						message: "What kind of Slack bot is this?",
						default: "slack",
						choices: [
							{
								name: "Regular org bot",
								value: "slack",
							},
							{
								name: "Admin impersonation bot",
								value: "slack_admin",
							},
						],
					},
				]
			: []),
		{
			type: "input",
			name: "appName",
			message: "Slack app name",
			default: ({ provider }: { provider?: SlackInstallProvider }) =>
				args.appName ??
				defaultAppNameForProvider({
					provider: provider ?? args.provider ?? "slack",
				}),
		},
		...(!args.baseUrl
			? [
					{
						type: "input" as const,
						name: "baseUrl" as const,
						message: "Public ngrok/Leaf URL",
						default:
							process.env.NGROK_URL ??
							process.env.SLACK_BOT_URL ??
							process.env.CHAT_URL,
						filter: (value: string) => trimTrailingSlash({ url: value.trim() }),
						validate: (value: string) =>
							isUrl({ value }) || "Enter a valid http(s) URL",
					},
				]
			: []),
		...(!args.envFile
			? [
					{
						type: "input" as const,
						name: "envFile" as const,
						message: "Env file to write (leave blank to only print)",
					},
				]
			: []),
	]);

	return {
		...args,
		provider: answers.provider ?? args.provider ?? "slack",
		appName: answers.appName ?? args.appName,
		baseUrl: answers.baseUrl ?? args.baseUrl,
		envFile: answers.envFile?.trim() || args.envFile,
	};
};

const buildSlackManifest = ({
	appName,
	baseUrl,
	scopes,
}: {
	appName: string;
	baseUrl: string;
	scopes: string[];
}): SlackManifest => {
	const publicBaseUrl = trimTrailingSlash({ url: baseUrl });
	return {
		display_information: {
			name: appName,
		},
		features: {
			app_home: {
				home_tab_enabled: false,
				messages_tab_enabled: true,
				messages_tab_read_only_enabled: false,
			},
			bot_user: {
				display_name: appName,
				always_online: false,
			},
		},
		oauth_config: {
			redirect_urls: [`${publicBaseUrl}/slack/oauth/callback`],
			scopes: {
				bot: scopes,
			},
		},
		settings: {
			event_subscriptions: {
				request_url: `${publicBaseUrl}/slack/events`,
				bot_events: defaultBotEvents,
			},
			interactivity: {
				is_enabled: true,
				request_url: `${publicBaseUrl}/slack/interactions`,
			},
			org_deploy_enabled: false,
			socket_mode_enabled: false,
			token_rotation_enabled: false,
		},
	};
};

const runSlackCli = ({
	args,
	quiet = false,
}: {
	args: string[];
	quiet?: boolean;
}) => {
	const result = Bun.spawnSync(["slack", "--skip-update", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = new TextDecoder().decode(result.stdout).trim();
	const stderr = new TextDecoder().decode(result.stderr).trim();

	if (!quiet) {
		if (stdout) console.log(stdout);
		if (stderr) console.error(stderr);
	}

	if (result.exitCode !== 0) {
		throw new Error(
			[
				`slack ${args.join(" ")} failed`,
				stdout || undefined,
				stderr || undefined,
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return stdout;
};

const ensureSlackCli = () => {
	try {
		runSlackCli({ args: ["version"], quiet: true });
	} catch {
		console.log(
			chalk.yellow(
				"Slack CLI is not installed. Install it, then rerun this command:",
			),
		);
		console.log(
			"curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash",
		);
		throw new Error("Slack CLI is required for Slack setup");
	}
};

const maybeShowSlackCliAuthInstructions = () => {
	try {
		const authList = runSlackCli({ args: ["auth", "list"], quiet: true });
		if (authList.includes("No teams are authorized")) {
			console.log(chalk.yellow("\nSlack CLI is not authenticated."));
			console.log("Run this in another terminal if Slack CLI asks for auth:");
			console.log("slack auth login");
		}
	} catch {
		console.log(chalk.yellow("\nCould not read Slack CLI auth state."));
		console.log("If Slack CLI prompts for auth, run: slack auth login");
	}
};

const parseSlackJson = <T>({
	output,
	label,
}: {
	output: string;
	label: string;
}): T => {
	try {
		return JSON.parse(output) as T;
	} catch {
		throw new Error(`Could not parse ${label} JSON from Slack CLI:\n${output}`);
	}
};

const getSlackApiAuthState = () => {
	const output = runSlackCli({
		args: ["api", "auth.test"],
		quiet: true,
	});
	return parseSlackJson<SlackApiResponse>({ output, label: "auth.test" });
};

const getTicketFromAuthTokenOutput = ({ output }: { output: string }) => {
	const match = output.match(/\/slackauthticket\s+([^\s]+)/);
	return match?.[1];
};

const getServiceTokenFromAuthTokenOutput = ({ output }: { output: string }) => {
	const match = output.match(/\b(xoxp-[A-Za-z0-9-]+)\b/);
	return match?.[1];
};

const ensureSlackApiAuth = async () => {
	const initial = getSlackApiAuthState();
	if (initial.ok) return undefined;
	if (initial.error !== "not_authed") {
		throw new Error(`Slack API auth failed: ${initial.error}`);
	}

	console.log(
		chalk.yellow(
			"\nSlack CLI is logged in, but API calls need a service token.",
		),
	);
	const ticketOutput = runSlackCli({
		args: ["auth", "token", "--no-prompt"],
		quiet: true,
	});
	console.log(ticketOutput);

	const ticket = getTicketFromAuthTokenOutput({ output: ticketOutput });
	if (!ticket) {
		throw new Error("Could not read Slack auth ticket from Slack CLI output");
	}

	const { challenge } = await inquirer.prompt<{ challenge: string }>([
		{
			type: "input",
			name: "challenge",
			message: "Slack challenge code",
			validate: (value: string) =>
				Boolean(value.trim()) || "Challenge code is required",
		},
	]);

	const tokenOutput = runSlackCli({
		args: [
			"auth",
			"token",
			"--ticket",
			ticket,
			"--challenge",
			challenge.trim(),
		],
		quiet: true,
	});
	console.log(tokenOutput);

	const serviceToken = getServiceTokenFromAuthTokenOutput({
		output: tokenOutput,
	});
	if (!serviceToken) {
		throw new Error("Could not read Slack service token from Slack CLI output");
	}

	const next = parseSlackJson<SlackApiResponse>({
		output: runSlackCli({
			args: ["api", "auth.test", "--token", serviceToken],
			quiet: true,
		}),
		label: "auth.test",
	});
	if (!next.ok) {
		throw new Error(`Slack API auth still failed: ${next.error}`);
	}

	return serviceToken;
};

const createSlackApp = async ({
	manifest,
	serviceToken,
	teamId,
}: {
	manifest: SlackManifest;
	serviceToken?: string;
	teamId?: string;
}): Promise<SlackManifestCreateResponse> => {
	const output = runSlackCli({
		args: [
			"api",
			"apps.manifest.create",
			...(serviceToken ? ["--token", serviceToken] : []),
			"--json",
			JSON.stringify({
				manifest: JSON.stringify(manifest),
				...(teamId ? { team_id: teamId } : {}),
			}),
		],
		quiet: true,
	});
	const json = parseSlackJson<SlackManifestCreateResponse>({
		output,
		label: "apps.manifest.create",
	});
	if (!json.ok) throw new Error(`Slack app creation failed: ${json.error}`);

	return json;
};

const escapeEnvValue = ({ value }: { value: string }) => {
	if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
	return JSON.stringify(value);
};

const upsertEnvFile = ({
	filePath,
	vars,
}: {
	filePath: string;
	vars: Record<string, string>;
}) => {
	const resolved = resolve(process.cwd(), filePath);
	const current = existsSync(resolved) ? readFileSync(resolved, "utf-8") : "";
	const lines = current.split("\n");
	const seen = new Set<string>();

	const updated = lines.map((line) => {
		for (const [key, value] of Object.entries(vars)) {
			if (line.startsWith(`${key}=`)) {
				seen.add(key);
				return `${key}=${escapeEnvValue({ value })}`;
			}
		}
		return line;
	});

	for (const [key, value] of Object.entries(vars)) {
		if (!seen.has(key)) {
			updated.push(`${key}=${escapeEnvValue({ value })}`);
		}
	}

	writeFileSync(resolved, updated.join("\n").replace(/\n{3,}/g, "\n\n"));
	console.log(chalk.green(`Wrote Slack env vars to ${resolved}`));
};

const printEnvExports = ({ vars }: { vars: Record<string, string> }) => {
	console.log(chalk.cyan("\nEnv exports:"));
	for (const [key, value] of Object.entries(vars)) {
		console.log(`export ${key}=${escapeEnvValue({ value })}`);
	}
};

const setupSlackBot = async ({ args }: { args: Args }) => {
	const resolvedArgs = await resolveInteractiveArgs({ args });
	const provider = resolvedArgs.provider;
	const readyLabel =
		provider === "slack_admin"
			? "Slack admin app ready"
			: "Slack local app ready";
	const nextStep =
		provider === "slack_admin"
			? "Start Leaf with these env vars, then go to Admin > Slack Bot and click Install."
			: "Start Leaf with these env vars, then go to Settings > Integrations and install Slack for the selected org.";

	const manifest = buildSlackManifest({
		appName: resolvedArgs.appName ?? defaultAppNameForProvider({ provider }),
		baseUrl: resolvedArgs.baseUrl,
		scopes: resolvedArgs.scopes,
	});

	if (resolvedArgs.printManifest || resolvedArgs.dryRun) {
		console.log(chalk.cyan("Slack app manifest:"));
		console.log(JSON.stringify(manifest, null, 2));
	}

	ensureSlackCli();
	maybeShowSlackCliAuthInstructions();
	const serviceToken = resolvedArgs.dryRun
		? undefined
		: await ensureSlackApiAuth();

	const slackResponse = resolvedArgs.dryRun
		? undefined
		: await createSlackApp({
				manifest,
				serviceToken,
				teamId: resolvedArgs.teamId,
			});

	const credentials = slackResponse?.credentials;
	const clientId = credentials?.client_id;
	const clientSecret = credentials?.client_secret;
	const signingSecret = credentials?.signing_secret;
	const redirectUrl = manifest.oauth_config.redirect_urls[0];

	if (!resolvedArgs.dryRun && (!clientId || !clientSecret || !signingSecret)) {
		console.log(
			chalk.yellow("Slack response did not include all credentials."),
		);
		console.log(JSON.stringify(slackResponse, null, 2));
		throw new Error("Could not extract Slack app credentials from response");
	}

	const envVars = {
		SLACK_CLIENT_ID: clientId ?? "<client-id-from-slack>",
		SLACK_CLIENT_SECRET: clientSecret ?? "<client-secret-from-slack>",
		SLACK_SIGNING_SECRET: signingSecret ?? "<signing-secret-from-slack>",
		SLACK_REDIRECT_URI: redirectUrl,
	};

	console.log(chalk.green(`\n${readyLabel}`));
	if (slackResponse?.app_id) console.log(`App ID: ${slackResponse.app_id}`);
	printEnvExports({ vars: envVars });

	if (resolvedArgs.envFile) {
		upsertEnvFile({
			filePath: resolvedArgs.envFile,
			vars: envVars,
		});
	}

	if (slackResponse?.oauth_authorize_url) {
		console.log(
			chalk.gray(
				"\nSlack returned a raw OAuth URL, but Autumn installs require signed state. Use the Autumn UI install flow instead.",
			),
		);
	}
	console.log(chalk.cyan(`\nNext step:\n${nextStep}`));
};

const setupAdminBot = async ({ args }: { args: Args }) =>
	setupSlackBot({ args: { ...args, provider: "slack_admin" } });

const setupLocalBot = async ({ args }: { args: Args }) =>
	setupSlackBot({ args: { ...args, provider: "slack" } });

const actions = {
	"setup-bot": setupSlackBot,
	"setup-admin-bot": setupAdminBot,
	"setup-local-bot": setupLocalBot,
	"setup-regular-bot": setupLocalBot,
} satisfies Record<string, (params: { args: Args }) => Promise<void>>;

type Action = keyof typeof actions;

const isAction = (action: string | undefined): action is Action =>
	action !== undefined && Object.hasOwn(actions, action);

const main = async () => {
	const args = parseArgs({ argv: process.argv.slice(2) });
	if (args.help || !isAction(args.action)) {
		console.log(usage());
		process.exit(args.help ? 0 : 1);
	}

	await actions[args.action]({ args });
};

try {
	await main();
} catch (error) {
	console.error(
		chalk.red(error instanceof Error ? error.message : String(error)),
	);
	process.exit(1);
}
