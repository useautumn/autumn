import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import inquirer from "inquirer";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = join(rootDir, "docker", "dev-services.compose.yml");
const composeProject = "autumn-dev-services";
const zshrcFile = join(homedir(), ".zshrc");
const ngrokConfigFiles = [
	join(homedir(), "Library", "Application Support", "ngrok", "ngrok.yml"),
	join(homedir(), ".config", "ngrok", "ngrok.yml"),
	join(homedir(), ".ngrok2", "ngrok.yml"),
];

const localConfig = {
	postgresPort: 5432,
	ngrokApiPort: 4040,
	redisStackPort: 6379,
	dragonflyPort: 6380,
	apiServerPort: 8080,
	mcpServerPort: 3099,
	databaseUrl: "postgresql://postgres:postgres@localhost:5432/autumn",
	chatStateDatabaseUrl: "postgresql://postgres:postgres@localhost:5432/chat",
	cacheUrl: "redis://localhost:6379",
	dragonflyUrl: "redis://localhost:6380",
};

const command = process.argv[2] ?? "help";
const flags = new Set(process.argv.slice(3));

const log = (message: string) => console.log(`[dev:services] ${message}`);

const composeEnv = { ...process.env };

const readShellConfigEnvVar = ({ key }: { key: string }) => {
	if (!existsSync(zshrcFile)) return;

	const match = readFileSync(zshrcFile, "utf-8").match(
		new RegExp(`^\\s*(?:export\\s+)?${key}=(.+?)\\s*$`, "m"),
	);
	return match?.[1]?.trim().replace(/^["']|["']$/g, "");
};

const writeShellConfigEnvVar = ({
	key,
	value,
}: {
	key: string;
	value: string;
}) => {
	const current = existsSync(zshrcFile)
		? readFileSync(zshrcFile, "utf-8").split("\n")
		: [];
	let updated = false;
	const lines = current.map((line) => {
		if (new RegExp(`^\\s*(?:export\\s+)?${key}=`).test(line)) {
			updated = true;
			return `export ${key}=${value}`;
		}
		return line;
	});
	if (!updated) lines.push(`export ${key}=${value}`);

	writeFileSync(zshrcFile, `${lines.join("\n").replace(/\n+$/, "")}\n`);
};

const readNgrokAuthtokenFromConfig = () => {
	for (const configFile of ngrokConfigFiles) {
		if (!existsSync(configFile)) continue;

		const match = readFileSync(configFile, "utf-8").match(
			/^\s*authtoken:\s*(.+?)\s*$/m,
		);
		const token = match?.[1]?.trim().replace(/^["']|["']$/g, "");
		if (token) return token;
	}
};

const getDomainFromUrl = ({ url }: { url: string }) => {
	const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
	return new URL(normalizedUrl).host;
};

const configureNgrokUrl = () => {
	const ngrokUrl = composeEnv.NGROK_URL;
	if (!ngrokUrl) {
		throw new Error(
			"NGROK_URL is required for dev services. It should be injected from Infisical dev secrets.",
		);
	}

	composeEnv.NGROK_DOMAIN = getDomainFromUrl({ url: ngrokUrl });
};

const configureNgrokTarget = ({ target }: { target: "api" | "mcp" }) => {
	const port =
		target === "mcp" ? localConfig.mcpServerPort : localConfig.apiServerPort;
	composeEnv.NGROK_TARGET = `host.docker.internal:${port}`;
};

const configureNgrokToken = async () => {
	if (composeEnv.NGROK_AUTHTOKEN) return;

	const shellToken = readShellConfigEnvVar({ key: "NGROK_AUTHTOKEN" });
	if (shellToken) {
		composeEnv.NGROK_AUTHTOKEN = shellToken;
		return;
	}

	const configuredToken = readNgrokAuthtokenFromConfig();
	if (configuredToken) {
		composeEnv.NGROK_AUTHTOKEN = configuredToken;
		writeShellConfigEnvVar({
			key: "NGROK_AUTHTOKEN",
			value: configuredToken,
		});
		log(`saved NGROK_AUTHTOKEN from local ngrok config to ${zshrcFile}`);
		return;
	}

	log(`NGROK_AUTHTOKEN will be saved to ${zshrcFile} after first entry`);
	const { token } = await inquirer.prompt<{ token: string }>([
		{
			type: "password",
			name: "token",
			message: "NGROK_AUTHTOKEN",
			mask: "*",
			validate: (value: string) =>
				Boolean(value.trim()) || "NGROK_AUTHTOKEN is required",
		},
	]);

	composeEnv.NGROK_AUTHTOKEN = token.trim();
	writeShellConfigEnvVar({ key: "NGROK_AUTHTOKEN", value: token.trim() });
	log(`saved NGROK_AUTHTOKEN to ${zshrcFile}`);
};

const run = ({
	cmd,
	args,
	allowFailure = false,
	quiet = false,
}: {
	cmd: string;
	args: string[];
	allowFailure?: boolean;
	quiet?: boolean;
}) => {
	const result = Bun.spawnSync([cmd, ...args], {
		cwd: rootDir,
		env: composeEnv,
		stdout: quiet ? "pipe" : "inherit",
		stderr: quiet ? "pipe" : "inherit",
	});

	if (!allowFailure && result.exitCode !== 0) {
		throw new Error(`${cmd} ${args.join(" ")} failed`);
	}

	return result;
};

const composeArgs = ({ args }: { args: string[] }) => [
	"compose",
	"-p",
	composeProject,
	"-f",
	composeFile,
	"--profile",
	"ngrok",
	...args,
];

const dockerCompose = ({
	args,
	quiet = false,
	allowFailure = false,
}: {
	args: string[];
	quiet?: boolean;
	allowFailure?: boolean;
}) =>
	run({
		cmd: "docker",
		args: composeArgs({ args }),
		quiet,
		allowFailure,
	});

const waitForTcp = ({ port, label }: { port: number; label: string }) =>
	new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const tryConnect = () => {
			attempts++;
			const socket = createConnection({ host: "127.0.0.1", port });
			socket.once("connect", () => {
				socket.destroy();
				resolve();
			});
			socket.once("error", () => {
				socket.destroy();
				if (attempts >= 60) {
					reject(new Error(`${label} did not become ready on :${port}`));
					return;
				}
				setTimeout(tryConnect, 500);
			});
		};
		tryConnect();
	});

const volumeName = (name: string) => `${composeProject}_${name}`;

const removeVolumes = ({
	nonPostgres = false,
	postgres = false,
}: {
	nonPostgres?: boolean;
	postgres?: boolean;
} = {}) => {
	const volumes = [
		...(nonPostgres
			? [
					"autumn-dev-redis-stack",
					"autumn-dev-dragonfly",
					"autumn-dev-localstack",
				]
			: []),
		...(postgres ? ["autumn-dev-postgres-18", "autumn-dev-postgres"] : []),
	];

	for (const volume of volumes) {
		run({
			cmd: "docker",
			args: ["volume", "rm", volumeName(volume)],
			allowFailure: true,
		});
	}
};

const check = async ({
	label,
	fn,
}: {
	label: string;
	fn: () => Promise<void> | void;
}) => {
	try {
		await fn();
		console.log(`ok ${label}`);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.log(`fail ${label}: ${message}`);
		return false;
	}
};

const doctor = async () => {
	const results = await Promise.all([
		check({
			label: "Postgres :5432",
			fn: () =>
				waitForTcp({ port: localConfig.postgresPort, label: "Postgres" }),
		}),
		check({
			label: "Redis Stack :6379",
			fn: () =>
				waitForTcp({
					port: localConfig.redisStackPort,
					label: "Redis Stack",
				}),
		}),
		check({
			label: "Dragonfly :6380",
			fn: () =>
				waitForTcp({ port: localConfig.dragonflyPort, label: "Dragonfly" }),
		}),
	]);

	if (results.some((result) => !result)) process.exit(1);
};

const psql = ({ args, quiet = false }: { args: string[]; quiet?: boolean }) =>
	dockerCompose({
		args: ["exec", "-T", "postgres", "psql", "-U", "postgres", ...args],
		quiet,
	});

const ensureChatDatabase = () => {
	const result = psql({
		args: [
			"-d",
			"postgres",
			"-tAc",
			"SELECT 1 FROM pg_database WHERE datname = 'chat'",
		],
		quiet: true,
	});
	const exists = new TextDecoder().decode(result.stdout).trim() === "1";
	if (exists) {
		log("chat database already exists");
		return;
	}

	log("creating chat database");
	psql({ args: ["-d", "postgres", "-c", "CREATE DATABASE chat"] });
};

const ensureNgrokRunning = () => {
	const result = dockerCompose({
		args: ["ps", "--status", "running", "--services", "ngrok"],
		quiet: true,
	});
	const services = new TextDecoder().decode(result.stdout).trim().split("\n");
	if (!services.includes("ngrok")) {
		const logs = dockerCompose({
			args: ["logs", "--tail", "40", "ngrok"],
			quiet: true,
			allowFailure: true,
		});
		const stderr = new TextDecoder().decode(logs.stderr).trim();
		const stdout = new TextDecoder().decode(logs.stdout).trim();
		throw new Error(
			[
				"ngrok container is not running",
				stdout || stderr ? `${stdout}\n${stderr}`.trim() : undefined,
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
};

const getNgrokUrl = async () => {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const response = await fetch(
				`http://127.0.0.1:${localConfig.ngrokApiPort}/api/tunnels`,
			);
			const data = (await response.json()) as {
				tunnels?: Array<{ public_url?: string; proto?: string }>;
			};
			const tunnel = data.tunnels?.find(
				(tunnel) => tunnel.proto === "https" && tunnel.public_url,
			);
			if (tunnel?.public_url) return tunnel.public_url.replace(/\/$/, "");
		} catch {
			// ngrok's local API is not ready yet.
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error("ngrok did not expose a public URL on :4040");
};

const up = async ({ ngrokTarget }: { ngrokTarget: "api" | "mcp" }) => {
	configureNgrokUrl();
	configureNgrokTarget({ target: ngrokTarget });
	await configureNgrokToken();
	log("starting Docker services");
	dockerCompose({
		args: ["rm", "-sf", "ngrok"],
		allowFailure: true,
	});
	dockerCompose({
		args: ["up", "-d", "--remove-orphans"],
	});

	await Promise.all([
		waitForTcp({ port: localConfig.postgresPort, label: "Postgres" }),
		waitForTcp({ port: localConfig.redisStackPort, label: "Redis Stack" }),
		waitForTcp({ port: localConfig.dragonflyPort, label: "Dragonfly" }),
		waitForTcp({ port: localConfig.ngrokApiPort, label: "ngrok" }),
	]);

	ensureChatDatabase();
	await doctor();
	ensureNgrokRunning();

	const ngrokUrl = await getNgrokUrl();
	log(`ngrok target: ${composeEnv.NGROK_TARGET}`);
	log(`ngrok URL: ${ngrokUrl}`);
	log(`export NGROK_URL=${ngrokUrl}`);
};

const down = () => {
	const removeNonPostgresVolumes = flags.has("--volumes");
	const removePostgresVolume = flags.has("--postgres");

	dockerCompose({ args: ["down", "--remove-orphans"] });

	if (removeNonPostgresVolumes || removePostgresVolume) {
		removeVolumes({
			nonPostgres: removeNonPostgresVolumes,
			postgres: removePostgresVolume,
		});
	}
};

const prune = () => {
	log("removing dev service containers and non-Postgres volumes");
	dockerCompose({ args: ["down", "--remove-orphans"] });
	removeVolumes({ nonPostgres: true, postgres: flags.has("--postgres") });

	log("pruning dangling Docker images");
	run({ cmd: "docker", args: ["image", "prune", "--force"] });

	log("pruning Docker build cache");
	run({ cmd: "docker", args: ["builder", "prune", "--force"] });
};

const help = () => {
	console.log(`Usage: bun dev:services <command>

Commands:
  up                         Start local Postgres, Redis Stack, Dragonfly, and ngrok
  up --mcp                   Start services with ngrok pointed at localhost:3099
  up:mcp                     Alias for up --mcp
  down                       Stop local services and keep all data
  down --volumes             Stop services and delete Redis/Dragonfly data
  down --postgres            Stop services and delete Postgres data
  doctor                     Check local service readiness
  prune [--postgres]         Delete non-Postgres volumes and prune dangling Docker cache
  help                       Show this message

Local service values:
  DATABASE_URL=${localConfig.databaseUrl}
  CHAT_STATE_DATABASE_URL=${localConfig.chatStateDatabaseUrl}
  NGROK_URL=<printed by bun dev:services up>
  CACHE_URL=${localConfig.cacheUrl}
  CACHE_URL_US_EAST=${localConfig.cacheUrl}
  CACHE_V2_DRAGONFLY_URL=${localConfig.dragonflyUrl}
`);
};

switch (command) {
	case "up":
		await up({ ngrokTarget: flags.has("--mcp") ? "mcp" : "api" });
		break;
	case "up:mcp":
		await up({ ngrokTarget: "mcp" });
		break;
	case "down":
		down();
		break;
	case "doctor":
		await doctor();
		break;
	case "prune":
		prune();
		break;
	case "help":
	case "--help":
	case "-h":
		help();
		break;
	default:
		console.error(`Unknown command: ${command}\n`);
		help();
		process.exit(1);
}
