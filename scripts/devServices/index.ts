import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = join(rootDir, "docker", "dev-services.compose.yml");
const composeProject = "autumn-dev-services";

const localConfig = {
	postgresPort: 5432,
	redisStackPort: 6379,
	dragonflyPort: 6380,
	databaseUrl: "postgresql://postgres:postgres@localhost:5432/autumn",
	chatStateDatabaseUrl: "postgresql://postgres:postgres@localhost:5432/chat",
	cacheUrl: "redis://localhost:6379",
	dragonflyUrl: "redis://localhost:6380",
};

const command = process.argv[2] ?? "help";
const flags = new Set(process.argv.slice(3));

const log = (message: string) => console.log(`[dev:services] ${message}`);

const composeEnv = { ...process.env };

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

const up = async () => {
	log("starting Docker services");
	dockerCompose({ args: ["up", "-d", "--remove-orphans"] });

	await Promise.all([
		waitForTcp({ port: localConfig.postgresPort, label: "Postgres" }),
		waitForTcp({ port: localConfig.redisStackPort, label: "Redis Stack" }),
		waitForTcp({ port: localConfig.dragonflyPort, label: "Dragonfly" }),
	]);

	ensureChatDatabase();
	await doctor();
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
  up                         Start local Postgres, Redis Stack, and Dragonfly
  down                       Stop local services and keep all data
  down --volumes             Stop services and delete Redis/Dragonfly data
  down --postgres            Stop services and delete Postgres data
  doctor                     Check local service readiness
  prune [--postgres]         Delete non-Postgres volumes and prune dangling Docker cache
  help                       Show this message

Local service values:
  DATABASE_URL=${localConfig.databaseUrl}
  CHAT_STATE_DATABASE_URL=${localConfig.chatStateDatabaseUrl}
  CACHE_URL=${localConfig.cacheUrl}
  CACHE_URL_US_EAST=${localConfig.cacheUrl}
  CACHE_V2_DRAGONFLY_URL=${localConfig.dragonflyUrl}
`);
};

switch (command) {
	case "up":
		await up();
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
