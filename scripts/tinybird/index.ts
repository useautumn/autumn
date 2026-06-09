import path from "node:path";
import { createTinybirdApi } from "@tinybirdco/sdk";

type ProfileName = "dev" | "prod" | "prod-legacy";
type TinybirdTarget = "new" | "legacy";

type Profile = {
	infisicalEnv: "dev" | "prod";
	target: TinybirdTarget;
};

const PROFILE_ARG_VALUES = new Set(["prod", "prod-legacy"]);

const profiles: Record<ProfileName, Profile> = {
	dev: {
		infisicalEnv: "dev",
		target: "new",
	},
	prod: {
		infisicalEnv: "prod",
		target: "new",
	},
	"prod-legacy": {
		infisicalEnv: "prod",
		target: "legacy",
	},
};

const commandAliases: Record<string, string[]> = {
	info: ["info"],
	"deploy:check": ["deploy", "--check"],
	deploy: ["deploy"],
};

const usage = `Usage:
  bun tb info
  bun tb deploy:check
  bun tb deploy
  bun tb token:read <token_name>
  bun tb:prod <tinybird command...>
  bun tb:prod-legacy <tinybird command...>

Targets:
  bun tb             Infisical dev, new Tinybird instance
  bun tb:prod       Infisical prod, new Tinybird instance
  bun tb:prod-legacy Infisical prod, legacy Tinybird instance`;

const rootDir = path.resolve(import.meta.dir, "../..");
const serverDir = path.join(rootDir, "server");

const run = async (
	cmd: string[],
	options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => {
	const proc = Bun.spawn(cmd, {
		cwd: options?.cwd ?? rootDir,
		env: options?.env,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});

	return proc.exited;
};

const requireEnv = (name: string) => {
	const value = process.env[name];
	if (!value) {
		console.error(`${name} is not set`);
		process.exit(1);
	}
	return value;
};

const requireEnvValue = (env: NodeJS.ProcessEnv, name: string) => {
	const value = env[name];
	if (!value) {
		console.error(`${name} is not set`);
		process.exit(1);
	}
	return value;
};

const resolveTinybirdArgs = (args: string[]) => {
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		console.log(usage);
		process.exit(args.length === 0 ? 1 : 0);
	}

	if (args[0] === "token:read") {
		const tokenName = args[1];
		if (!tokenName || args.length > 2) {
			console.error("Usage: bun tb token:read <token_name>");
			process.exit(1);
		}

		return args;
	}

	return commandAliases[args[0]] ?? args;
};

const createReadToken = async (tokenName: string, env: NodeJS.ProcessEnv) => {
	const baseUrl = requireEnvValue(env, "TINYBIRD_API_URL");
	const api = createTinybirdApi({
		baseUrl,
		token: requireEnvValue(env, "TINYBIRD_TOKEN"),
	});

	const url = new URL("/v0/tokens/", `${baseUrl}/`);
	url.searchParams.set("name", tokenName);
	url.searchParams.set("scope", "WORKSPACE:READ_ALL");

	const response = await api.request(url.toString(), {
		method: "POST",
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to create Tinybird read token: ${body}`);
	}

	const result = (await response.json()) as { token?: string };
	console.log(result.token ?? JSON.stringify(result));
};

const executeTinybird = async () => {
	const target = requireEnv("AUTUMN_TINYBIRD_TARGET") as TinybirdTarget;
	const env = { ...process.env };

	if (target === "new") {
		env.TINYBIRD_API_URL = requireEnv("TINYBIRD_US_EAST_API_URL");
		env.TINYBIRD_TOKEN = requireEnv("TINYBIRD_US_EAST_TOKEN");
	} else {
		requireEnv("TINYBIRD_API_URL");
		requireEnv("TINYBIRD_TOKEN");
	}

	const args = resolveTinybirdArgs(Bun.argv.slice(2));
	if (args[0] === "token:read") {
		await createReadToken(args[1], env);
		return;
	}

	const exitCode = await run(["bunx", "tinybird", ...args], {
		cwd: serverDir,
		env,
	});
	process.exit(exitCode);
};

const main = async () => {
	if (process.env.AUTUMN_TINYBIRD_BOOTSTRAPPED === "1") {
		await executeTinybird();
		return;
	}

	const rawArgs = Bun.argv.slice(2);
	const profileName = PROFILE_ARG_VALUES.has(rawArgs[0])
		? (rawArgs.shift() as ProfileName)
		: "dev";
	const profile = profiles[profileName];
	const args = resolveTinybirdArgs(rawArgs);

	const exitCode = await run(
		[
			"infisical",
			"run",
			`--env=${profile.infisicalEnv}`,
			"--recursive",
			"--",
			"bun",
			"scripts/tinybird/index.ts",
			...args,
		],
		{
			env: {
				...process.env,
				AUTUMN_TINYBIRD_BOOTSTRAPPED: "1",
				AUTUMN_TINYBIRD_TARGET: profile.target,
			},
		},
	);
	process.exit(exitCode);
};

await main();
