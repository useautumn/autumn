import "dotenv/config";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

// Repo root resolved from this file, so worktree lookups work regardless of cwd.
const repoRoot = resolve(import.meta.dir, "../..");

const readEnvVarFromFile = ({
	filePath,
	key,
}: {
	filePath: string;
	key: string;
}): string | undefined => {
	if (!existsSync(filePath)) return undefined;
	for (const line of readFileSync(filePath, "utf-8").split(/\r?\n/)) {
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (match && match[1] === key) {
			return match[2].trim().replace(/^["']|["']$/g, "") || undefined;
		}
	}
	return undefined;
};

// `bun dw setup` writes each worktree's tunnel to its own server/.env.local and
// the dw registry. Prefer those over process.env.NGROK_URL, which Infisical
// injects as a single shared dev tunnel — otherwise every worktree's Slack app
// would be pointed at the same URL instead of its own.
const resolveWorktreeNgrokUrl = (): string | undefined => {
	const fromEnvFile = readEnvVarFromFile({
		filePath: join(repoRoot, "server", ".env.local"),
		key: "NGROK_URL",
	});
	if (fromEnvFile) return fromEnvFile;

	try {
		const registryPath = join(homedir(), ".autumn-worktrees.json");
		if (existsSync(registryPath)) {
			const registry = JSON.parse(readFileSync(registryPath, "utf-8")) as Record<
				string,
				{ ngrokUrl?: string }
			>;
			const entry = registry[repoRoot];
			if (entry?.ngrokUrl) return entry.ngrokUrl;
		}
	} catch {
		// Malformed/absent registry — fall through to the shared env value.
	}

	return process.env.NGROK_URL;
};

const defaultSlackScopes = [
	"app_mentions:read",
	"assistant:write",
	"channels:history",
	"channels:read",
	"chat:write",
	"files:read",
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
	"assistant_thread_started",
	"assistant_thread_context_changed",
	"message.channels",
	"message.groups",
	"message.im",
	"message.mpim",
];

type Args = {
	action?: string;
	appId?: string;
	appName?: string;
	baseUrl?: string;
	dryRun: boolean;
	envFile?: string;
	help: boolean;
	printManifest: boolean;
	provider?: SlackInstallProvider;
	scopes: string[];
	target?: SlackManifestTarget;
	teamId?: string;
};

type SlackInstallProvider = "slack" | "slack_admin";
type SlackManifestTarget = "local" | "prod" | "admin" | "all";

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

type SlackManifestUpdateResponse = SlackApiResponse & {
	app_id?: string;
};

type SlackApiResponse = {
	ok: boolean;
	error?: string;
	[key: string]: unknown;
};

const usage = () =>
	[
		chalk.bold("Autumn Slack app tooling"),
		"",
		chalk.bold("Usage:"),
		"  bun slack <command> [options]",
		"",
		chalk.bold("Commands:"),
		`  ${chalk.cyan("worktree")}                   Repoint the local Slack app's chat (/slack/events),`,
		"                             approval (/slack/interactions) and OAuth URLs at THIS",
		"                             worktree's ngrok tunnel. Base URL is auto-read from",
		"                             server/.env.local / the dw registry — no --base-url needed.",
		`  ${chalk.cyan("setup-bot")}                  Interactively create a NEW Slack app (manifest) for`,
		"                             local dev and print its credentials. Prompts for a",
		"                             regular org bot or an admin impersonation bot.",
		`  ${chalk.cyan("update-manifest")}            Update an EXISTING Slack app's manifest. Choose the`,
		"                             app(s) with --target <local|prod|admin|all>.",
		"",
		chalk.bold("Options:"),
		"  --app-id <id>              Existing Slack app id for manifest updates.",
		"  --base-url <url>           Public Leaf URL. Defaults to this worktree's NGROK_URL,",
		"                             then SLACK_BOT_URL / CHAT_URL.",
		"  --name <name>              Slack app name. Defaults to Autumn Chat Local.",
		"  --env-file <path>          Write Slack env vars to this file.",
		"  --provider <provider>      slack or slack_admin (setup-bot only).",
		"  --scopes <csv>             Override bot scopes.",
		"  --target <target>          update-manifest target: local, prod, admin, or all.",
		"  --team-id <id>             Workspace team id for org-scoped Slack CLI auth.",
		"  --print-manifest           Print generated Slack app manifest.",
		"  --dry-run                  Print manifest/env without calling Slack.",
		"  --help                     Show this help.",
		"",
		chalk.bold("Examples:"),
		"  bun slack worktree",
		"  bun slack setup-bot --provider slack_admin",
		"  bun slack update-manifest --target all --base-url https://j.dev.useautumn.com",
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
	// No positional command (or flags only) => show help. The interactive setup
	// now lives behind the explicit `setup-bot` command.
	const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : undefined;
	const scopes = readOption({ args: argv, name: "--scopes" });
	const providerArg = readOption({ args: argv, name: "--provider" });
	const targetArg = readOption({ args: argv, name: "--target" });
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
		appId: readOption({ args: argv, name: "--app-id" }),
		appName: readOption({ args: argv, name: "--name" }) ?? defaultAppName,
		baseUrl:
			readOption({ args: argv, name: "--base-url" }) ??
			resolveWorktreeNgrokUrl() ??
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
		target:
			targetArg === "local" ||
			targetArg === "prod" ||
			targetArg === "admin" ||
			targetArg === "all"
				? targetArg
				: action === "update-local-manifest" || action === "worktree"
					? "local"
					: action === "update-prod-manifest"
						? "prod"
						: action === "update-admin-manifest"
							? "admin"
							: action === "update-all-manifests"
								? "all"
								: undefined,
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
							resolveWorktreeNgrokUrl() ??
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

// App Manifest APIs (apps.manifest.create/update) require an *app configuration
// token*, NOT the Slack CLI service token — the latter yields `missing_scope`.
// Config tokens come from https://api.slack.com/apps → "Your App Configuration
// Tokens". Generate once, set SLACK_CONFIG_REFRESH_TOKEN, and we self-rotate.
const configTokenStorePath = join(homedir(), ".autumn-slack-config.json");

const readStoredRefreshToken = (): string | undefined => {
	if (!existsSync(configTokenStorePath)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(configTokenStorePath, "utf-8")) as {
			refreshToken?: string;
		};
		return parsed.refreshToken;
	} catch {
		return undefined;
	}
};

const writeStoredRefreshToken = ({
	refreshToken,
}: {
	refreshToken: string;
}) => {
	writeFileSync(configTokenStorePath, JSON.stringify({ refreshToken }, null, 2));
	try {
		chmodSync(configTokenStorePath, 0o600);
	} catch {
		// Best-effort file permissions; not fatal where chmod is unavailable.
	}
};

// Exchange a (rotating) refresh token for a fresh 12h access token, persisting the
// new refresh token so the next run keeps working. No Authorization header — the
// refresh token itself is the credential.
const rotateConfigToken = async ({
	refreshToken,
}: {
	refreshToken: string;
}): Promise<string> => {
	const response = await fetch("https://slack.com/api/tooling.tokens.rotate", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ refresh_token: refreshToken }),
	});
	const json = (await response.json()) as {
		ok: boolean;
		token?: string;
		refresh_token?: string;
		error?: string;
	};
	if (!json.ok || !json.token || !json.refresh_token) {
		throw new Error(
			`Slack tooling.tokens.rotate failed: ${json.error ?? "unknown"}. Regenerate config tokens at https://api.slack.com/apps and reset SLACK_CONFIG_REFRESH_TOKEN.`,
		);
	}
	writeStoredRefreshToken({ refreshToken: json.refresh_token });
	return json.token;
};

const resolveSlackConfigToken = async (): Promise<string> => {
	// An explicit access token wins — a deliberate one-off override.
	if (process.env.SLACK_CONFIG_ACCESS_TOKEN) {
		return process.env.SLACK_CONFIG_ACCESS_TOKEN;
	}

	// Reliable path: rotate a refresh token into a fresh 12h access token. Static
	// access tokens (e.g. SLACK_ACCESS_TOKEN in Infisical) expire after 12h, so
	// rotation is preferred. Prefer the locally-persisted (already-rotated) token
	// over the env one, which goes stale after the first rotation.
	const refreshToken =
		readStoredRefreshToken() ??
		process.env.SLACK_REFRESH_TOKEN ??
		process.env.SLACK_CONFIG_REFRESH_TOKEN;
	if (refreshToken) {
		try {
			return await rotateConfigToken({ refreshToken });
		} catch (error) {
			// Refresh token already rotated/expired elsewhere — fall back to a
			// static access token if one is set, else surface the rotation error.
			const fallback =
				process.env.SLACK_ACCESS_TOKEN ?? process.env.SLACK_CONFIG_TOKEN;
			if (fallback) return fallback;
			throw error;
		}
	}

	const directToken =
		process.env.SLACK_ACCESS_TOKEN ?? process.env.SLACK_CONFIG_TOKEN;
	if (directToken) return directToken;

	throw new Error(
		[
			"No Slack app configuration token available.",
			"apps.manifest.update needs a *configuration* token (the CLI service token gives missing_scope).",
			"1) https://api.slack.com/apps → 'Your App Configuration Tokens' → Generate (workspace: autumnpricing).",
			"2) Set SLACK_REFRESH_TOKEN=<xoxe-...> (Infisical dev or your shell); it self-rotates after that.",
			"   Or set SLACK_CONFIG_ACCESS_TOKEN=<xoxe.xoxp-...> for a one-off (expires in 12h).",
		].join("\n"),
	);
};

const createSlackApp = async ({
	manifest,
	configToken,
	teamId,
}: {
	manifest: SlackManifest;
	configToken?: string;
	teamId?: string;
}): Promise<SlackManifestCreateResponse> => {
	const output = runSlackCli({
		args: [
			"api",
			"apps.manifest.create",
			...(configToken ? ["--token", configToken] : []),
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

const updateSlackAppManifest = async ({
	appId,
	manifest,
	configToken,
	teamId,
}: {
	appId: string;
	manifest: SlackManifest;
	configToken?: string;
	teamId?: string;
}): Promise<SlackManifestUpdateResponse> => {
	const output = runSlackCli({
		args: [
			"api",
			"apps.manifest.update",
			...(configToken ? ["--token", configToken] : []),
			"--json",
			JSON.stringify({
				app_id: appId,
				manifest: JSON.stringify(manifest),
				...(teamId ? { team_id: teamId } : {}),
			}),
		],
		quiet: true,
	});
	const json = parseSlackJson<SlackManifestUpdateResponse>({
		output,
		label: "apps.manifest.update",
	});
	if (!json.ok)
		throw new Error(`Slack app manifest update failed: ${json.error}`);

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
	const baseUrl = resolvedArgs.baseUrl;
	if (!baseUrl) throw new Error("Missing public Leaf URL");
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
		baseUrl,
		scopes: resolvedArgs.scopes,
	});

	if (resolvedArgs.printManifest || resolvedArgs.dryRun) {
		console.log(chalk.cyan("Slack app manifest:"));
		console.log(JSON.stringify(manifest, null, 2));
	}

	ensureSlackCli();
	const configToken = resolvedArgs.dryRun
		? undefined
		: await resolveSlackConfigToken();

	const slackResponse = resolvedArgs.dryRun
		? undefined
		: await createSlackApp({
				manifest,
				configToken,
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

const prodBaseUrl = "https://api.useautumn.com";

const targetDefaults = ({
	target,
}: {
	target: Exclude<SlackManifestTarget, "all">;
}) => {
	if (target === "prod") {
		return {
			appId: process.env.SLACK_PROD_APP_ID,
			appName: process.env.SLACK_PROD_APP_NAME ?? "Autumn",
			baseUrl: prodBaseUrl,
			provider: "slack" as const,
		};
	}
	if (target === "admin") {
		return {
			appId: process.env.SLACK_ADMIN_APP_IDS ?? process.env.SLACK_ADMIN_APP_ID,
			appName: process.env.SLACK_ADMIN_APP_NAME ?? "Autumn Chat Admin Local",
			baseUrl:
				resolveWorktreeNgrokUrl() ??
				process.env.SLACK_BOT_URL ??
				process.env.CHAT_URL,
			provider: "slack_admin" as const,
		};
	}
	return {
		appId: process.env.SLACK_APP_ID ?? process.env.SLACK_LOCAL_APP_ID,
		appName: process.env.SLACK_APP_NAME ?? "Autumn Chat Local",
		baseUrl:
			resolveWorktreeNgrokUrl() ??
			process.env.SLACK_BOT_URL ??
			process.env.CHAT_URL,
		provider: "slack" as const,
	};
};

const resolveManifestUpdateTarget = async ({
	args,
	target,
}: {
	args: Args;
	target: Exclude<SlackManifestTarget, "all">;
}) => {
	const defaults = targetDefaults({ target });
	const answers = await inquirer.prompt<{
		appIds?: string;
		appName?: string;
		baseUrl?: string;
	}>([
		...(!args.dryRun && !args.appId && !defaults.appId
			? [
					{
						type: "input" as const,
						name: "appIds" as const,
						message: `Slack app id(s) for ${target}`,
						validate: (value: string) =>
							Boolean(value.trim()) || "At least one Slack app id is required",
					},
				]
			: []),
		...(!args.baseUrl && !defaults.baseUrl
			? [
					{
						type: "input" as const,
						name: "baseUrl" as const,
						message: `Public Leaf URL for ${target}`,
						filter: (value: string) => trimTrailingSlash({ url: value.trim() }),
						validate: (value: string) =>
							isUrl({ value }) || "Enter a valid http(s) URL",
					},
				]
			: []),
	]);
	const baseUrl = args.baseUrl ?? answers.baseUrl ?? defaults.baseUrl;
	if (!baseUrl) throw new Error(`Missing base URL for ${target} manifest`);

	return {
		appIds: (args.appId ?? answers.appIds ?? defaults.appId)
			?.split(",")
			.map((appId) => appId.trim())
			.filter(Boolean),
		appName: args.appName ?? defaults.appName,
		baseUrl,
		provider: defaults.provider,
	};
};

const updateManifestTargets = async ({ args }: { args: Args }) => {
	const target = args.target ?? "local";
	const targets =
		target === "all"
			? (["local", "prod", "admin"] as const)
			: ([target] as Exclude<SlackManifestTarget, "all">[]);

	if (!args.dryRun) {
		ensureSlackCli();
	}
	const configToken = args.dryRun ? undefined : await resolveSlackConfigToken();

	for (const updateTarget of targets) {
		const targetArgs =
			target === "all"
				? {
						...args,
						appId: undefined,
						appName: undefined,
						baseUrl: updateTarget === "prod" ? undefined : args.baseUrl,
					}
				: args;
		const resolved = await resolveManifestUpdateTarget({
			args: targetArgs,
			target: updateTarget,
		});
		const manifest = buildSlackManifest({
			appName: resolved.appName,
			baseUrl: resolved.baseUrl,
			scopes: args.scopes,
		});

		if (args.printManifest || args.dryRun) {
			console.log(chalk.cyan(`\n${updateTarget} Slack app manifest:`));
			console.log(JSON.stringify(manifest, null, 2));
		}

		if (args.dryRun) continue;
		if (!resolved.appIds?.length) {
			throw new Error(`Missing Slack app id for ${updateTarget} manifest`);
		}
		for (const appId of resolved.appIds) {
			await updateSlackAppManifest({
				appId,
				manifest,
				configToken,
				teamId: args.teamId,
			});
			console.log(
				chalk.green(`Updated ${updateTarget} Slack app manifest (${appId})`),
			);
		}
	}
};

const actions = {
	"setup-bot": setupSlackBot,
	"setup-admin-bot": setupAdminBot,
	"setup-local-bot": setupLocalBot,
	"setup-regular-bot": setupLocalBot,
	"update-admin-manifest": updateManifestTargets,
	"update-all-manifests": updateManifestTargets,
	"update-local-manifest": updateManifestTargets,
	"update-manifest": updateManifestTargets,
	"update-prod-manifest": updateManifestTargets,
	worktree: updateManifestTargets,
} satisfies Record<string, (params: { args: Args }) => Promise<void>>;

type Action = keyof typeof actions;

const isAction = (action: string | undefined): action is Action =>
	action !== undefined && Object.hasOwn(actions, action);

const main = async () => {
	const args = parseArgs({ argv: process.argv.slice(2) });
	// `bun slack` (no command) or `--help` => show the help page and exit cleanly.
	if (args.help || !args.action) {
		console.log(usage());
		process.exit(0);
	}
	// A command was given but isn't one we know about => help + non-zero exit.
	if (!isAction(args.action)) {
		console.error(chalk.red(`Unknown command: ${args.action}\n`));
		console.log(usage());
		process.exit(1);
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
