#!/usr/bin/env bun

import { createHash, randomBytes } from "node:crypto";
import { connect } from "node:net";
import { join } from "node:path";
import { type Subprocess, spawn } from "bun";
import chalk from "chalk";
import {
	ATOM_PEER_PORT,
	ATOM_PORT,
	ATOM_URL,
	BALANCE_WORKER_PORT,
	DRAGONFLY_PORT,
	DYNAMODB_PORT,
	ELASTICMQ_PORT,
	KAFKA_BROKERS,
	KAFKA_PORT,
	PG_PORT,
	SERVER_PORT,
	TW_ENV,
} from "../constants.js";
import {
	type CapabilityService,
	PG_REPLICA_PORT,
	workerCapabilityServices,
} from "../helpers/testCapabilities.js";
import { prepareBalanceSyncQueue } from "./prepareBalanceSyncQueue.js";

export const READY_SENTINEL = "TW_WORKER_READY";

const SERVICE_HEALTH_TIMEOUT_MS = 60_000;
const SERVER_HEALTH_TIMEOUT_MS = 120_000;
const BALANCE_WORKER_HEALTH_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const CAPABILITY_RESTART_DELAY_MS = 1_000;
const TCP_CONNECT_TIMEOUT_MS = 1_000;

const bootStartedAt = Date.now();

const ATOM_ADMIN_TOKEN = `atom_admin_${randomBytes(32).toString("base64url")}`;
const log = (message: string): void => {
	console.log(
		chalk.cyan(`[tw-boot] +${Date.now() - bootStartedAt}ms ${message}`),
	);
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const resolveServerPort = (): number => {
	const fromEnv = process.env.SERVER_PORT;
	if (fromEnv && fromEnv.length > 0) {
		const parsed = Number.parseInt(fromEnv, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return SERVER_PORT;
};

const isTruthyEnv = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

const tcpProbe = (port: number): Promise<boolean> =>
	new Promise((resolve) => {
		const socket = connect({ host: "127.0.0.1", port });
		let settled = false;
		const finish = (ok: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(TCP_CONNECT_TIMEOUT_MS);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});

const waitForTcpPort = async (
	label: string,
	port: number,
	timeoutMs: number,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await tcpProbe(port)) {
			log(`${label} is up on :${port}`);
			return;
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] ${label} did not come up on localhost:${port} within ${timeoutMs}ms — aborting worker boot`,
	);
};

export const waitForServerHealth = async (
	port: number,
	timeoutMs: number,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	const url = `http://127.0.0.1:${port}/`;
	let lastStatus: number | string = "no-response";
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.ok) {
				log(`server health OK on :${port}`);
				return;
			}
			lastStatus = response.status;
		} catch (error) {
			lastStatus = (error as Error).name ?? "fetch-error";
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] server health (${url}) not ready within ${timeoutMs}ms (last status: ${lastStatus}) — aborting worker boot`,
	);
};

export const balanceWorkerEnabled = (): boolean =>
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED !== "false";

export const waitForBalanceWorkerHealth = async (
	timeoutMs: number,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	const url = `http://127.0.0.1:${BALANCE_WORKER_PORT}/health`;
	let lastStatus: number | string = "no-response";
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.ok) {
				log(`balance worker health OK on :${BALANCE_WORKER_PORT}`);
				return;
			}
			lastStatus = response.status;
		} catch (error) {
			lastStatus = (error as Error).name ?? "fetch-error";
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] balance worker health (${url}) not ready within ${timeoutMs}ms (last status: ${lastStatus}) — aborting worker boot`,
	);
};

export const startBalanceWorker = (repoRoot: string): Subprocess => {
	const workerRoot = join(repoRoot, "apps/balance-worker");
	log(
		`starting balance worker (bun src/main.ts) on :${BALANCE_WORKER_PORT}, brokers ${KAFKA_BROKERS}`,
	);
	return spawn(["bun", "--config=./bunfig.toml", "src/main.ts"], {
		cwd: workerRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
			KAFKA_BROKERS,
			KAFKA_AUTH_MODE: "none",
			BALANCE_WORKER_DEPLOYMENT: "local",
			BALANCE_WORKER_HOST: "127.0.0.1",
			BALANCE_WORKER_PORT: String(BALANCE_WORKER_PORT),
			BALANCE_WORKER_SQLITE_PATH: ":memory:",
			BALANCE_WORKER_CHECKPOINT_MODE: "off",
		} as Record<string, string>,
	});
};

export const startHerald = (repoRoot: string): Subprocess => {
	log(`starting herald (bun src/main.ts), brokers ${KAFKA_BROKERS}`);
	return spawn(["bun", "--config=./bunfig.toml", "src/main.ts"], {
		cwd: join(repoRoot, "apps/herald"),
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
			KAFKA_BROKERS,
			KAFKA_AUTH_MODE: "none",
			BALANCE_WORKER_DEPLOYMENT: "local",
		} as Record<string, string>,
	});
};

export const startAtom = (repoRoot: string): Subprocess => {
	log(`starting Atom (bun src/main.ts) on :${ATOM_PORT}`);
	return spawn(["bun", "--config=./bunfig.toml", "src/main.ts"], {
		cwd: join(repoRoot, "apps/atom"),
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			ATOM_MODE: "multi_tenant",
			ATOM_TOKEN_HASH: createHash("sha256")
				.update(ATOM_ADMIN_TOKEN)
				.digest("hex"),
			ATOM_SLOT_COUNT: "2",
			ATOM_PORT: String(ATOM_PORT),
			ATOM_PEER_PORT: String(ATOM_PEER_PORT),
			ATOM_PEER_SECRET: randomBytes(32).toString("hex"),
			ATOM_DATA_DIR: join(repoRoot, ".data", "atom"),
		} as Record<string, string>,
	});
};

const capabilityProcs = new Set<Subprocess>();
let capabilityServicesStopped = false;

const stopCapabilityServices = (): void => {
	capabilityServicesStopped = true;
	for (const proc of capabilityProcs) proc.kill();
};

const superviseCapabilityService = (
	repoRoot: string,
	service: CapabilityService,
): void => {
	log(
		`starting ${service.name} (${service.argv.join(" ")}) on :${service.port}`,
	);
	const proc = spawn(service.argv, {
		cwd: join(repoRoot, service.cwd),
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
			...service.env,
		} as Record<string, string>,
	});
	capabilityProcs.add(proc);
	void proc.exited.then(async (code) => {
		capabilityProcs.delete(proc);
		if (capabilityServicesStopped) return;
		console.error(
			chalk.red(
				`[tw-boot] ${service.name} exited with code ${code} — restarting`,
			),
		);
		await sleep(CAPABILITY_RESTART_DELAY_MS);
		if (!capabilityServicesStopped)
			superviseCapabilityService(repoRoot, service);
	});
};

const startNativeServices = async (repoRoot: string): Promise<void> => {
	const startScript = join(
		repoRoot,
		"scripts",
		"tw",
		"image",
		"start-services.sh",
	);
	log(`starting native services via ${startScript}`);
	const proc = spawn(["bash", startScript], {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: process.env as Record<string, string>,
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(
			`[tw-boot] start-services.sh exited with code ${exitCode} — services failed to start`,
		);
	}
};

export const startPgReplica = async (repoRoot: string): Promise<void> => {
	const startedAt = Date.now();
	log(`starting PostgreSQL hot standby on :${PG_REPLICA_PORT}`);
	const proc = spawn(
		["bash", join(repoRoot, "scripts", "tw", "image", "start-replica.sh")],
		{
			cwd: repoRoot,
			stdout: "inherit",
			stderr: "inherit",
			env: {
				...process.env,
				PG_PORT: String(PG_PORT),
				REPLICA_PORT: String(PG_REPLICA_PORT),
			} as Record<string, string>,
		},
	);
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(
			`[tw-boot] start-replica.sh exited with code ${exitCode} — PostgreSQL standby failed to start`,
		);
	}
	log(`PostgreSQL standby streaming (+${Date.now() - startedAt}ms)`);
};

export const provisionSvixApp = async (orgId: string): Promise<void> => {
	const svixAppId = process.env.SVIX_APP_ID;
	if (!svixAppId) {
		throw new Error(
			"[tw-boot] NEEDS_SVIX set but SVIX_APP_ID is missing — the orchestrator must create + inject the Svix app id (plan §9a)",
		);
	}

	log(`binding orchestrator-created Svix app ${svixAppId} into the Svix shard`);
	const { db } = await import("@server/db/initDrizzle.js");
	const { OrgService } = await import("@server/internal/orgs/OrgService.js");

	const org = await OrgService.get({ db, orgId });

	const updated = await OrgService.update({
		db,
		orgId,
		updates: {
			svix_config: {
				sandbox_app_id: svixAppId,
				live_app_id: org.svix_config?.live_app_id ?? "",
			},
		},
	});

	if (!updated) {
		throw new Error(
			`[tw-boot] failed to bind svix_config for org ${orgId} — update returned no row`,
		);
	}

	log(
		`Svix app ${svixAppId} bound to org ${orgId} (svix_config.sandbox_app_id)`,
	);
};

export const startServer = (repoRoot: string, port: number): Subprocess => {
	const serverRoot = join(repoRoot, "server");
	log(`starting Autumn server (bun src/index.ts) on :${port}`);
	return spawn(["bun", "src/index.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
			SERVER_PORT: String(port),
			ATOM_URL,
			ATOM_ADMIN_TOKEN,
		} as Record<string, string>,
	});
};

export const startBackgroundProcs = (
	repoRoot: string,
): { workersProc: Subprocess; cronProc: Subprocess } => {
	const serverRoot = join(repoRoot, "server");
	const env = {
		...process.env,
		NODE_ENV: "development",
	} as Record<string, string>;

	log("starting SQS queue workers (bun src/workers.ts)");
	const workersProc = spawn(["bun", "src/workers.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env,
	});

	log("starting cron (bun src/cron.ts)");
	const cronProc = spawn(["bun", "src/cron.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env,
	});

	return { workersProc, cronProc };
};

const main = async (): Promise<void> => {
	const repoRoot = process.cwd();
	const serverPort = resolveServerPort();

	const orgId = process.env.ORG_ID;
	if (!orgId) {
		throw new Error(
			"[tw-boot] ORG_ID is required — the orchestrator must inject the test org id",
		);
	}

	const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
	if (!stripeAccountId) {
		throw new Error(
			"[tw-boot] STRIPE_ACCOUNT_ID is required — the orchestrator must inject the sub-account it created (plan §9a)",
		);
	}

	await startNativeServices(repoRoot);
	await Promise.all([
		waitForTcpPort("PostgreSQL", PG_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("Dragonfly", DRAGONFLY_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("goaws (SQS)", ELASTICMQ_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("Kafka", KAFKA_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("dynoxide (DynamoDB)", DYNAMODB_PORT, 15_000).catch(
			(error) => {
				log(`WARN: continuing without dynoxide — ${(error as Error).message}`);
			},
		),
	]);
	log("native services healthy");

	await prepareBalanceSyncQueue();

	log("reconciling node_modules (bun install --frozen-lockfile)");
	const installEnv = process.env as Record<string, string>;
	let installExit = await spawn(["bun", "install", "--frozen-lockfile"], {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: installEnv,
	}).exited;
	if (installExit !== 0) {
		log("frozen install failed — regenerating lockfile (bun install)");
		installExit = await spawn(["bun", "install"], {
			cwd: repoRoot,
			stdout: "inherit",
			stderr: "inherit",
			env: installEnv,
		}).exited;
	}
	if (installExit !== 0) {
		throw new Error(
			`[tw-boot] bun install exited with code ${installExit} — dependency self-heal failed`,
		);
	}

	log("applying pending DB migrations (schema self-heal)");
	const migrateProc = spawn(["bun", "scripts/db/index.ts", "migrate"], {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: process.env as Record<string, string>,
	});
	const migrateExit = await migrateProc.exited;
	if (migrateExit !== 0) {
		throw new Error(
			`[tw-boot] db migrate exited with code ${migrateExit} — schema self-heal failed`,
		);
	}

	if (isTruthyEnv(process.env.TW_PG_REPLICA)) {
		await startPgReplica(repoRoot);
	}

	if (isTruthyEnv(process.env.NEEDS_SVIX)) {
		await provisionSvixApp(orgId);
	}

	log(`binding Stripe sub-account ${stripeAccountId}`);
	const { bindStripeAccount } = await import("./bindStripeAccount.js");
	await bindStripeAccount({ orgId, stripeAccountId });

	const balanceWorkerProc = balanceWorkerEnabled()
		? startBalanceWorker(repoRoot)
		: null;
	if (balanceWorkerProc) {
		void balanceWorkerProc.exited.then((code) => {
			if (code !== 0) {
				console.error(
					chalk.red(`[tw-boot] balance worker exited early with code ${code}`),
				);
			}
		});
		await waitForBalanceWorkerHealth(BALANCE_WORKER_HEALTH_TIMEOUT_MS);
		const heraldProc = startHerald(repoRoot);
		void heraldProc.exited.then((code) => {
			console.error(
				chalk.red(`[tw-boot] herald exited early with code ${code}`),
			);
		});
	} else {
		log("balance worker rollout off — server keeps the Postgres path");
	}

	const atomProc = startAtom(repoRoot);
	void atomProc.exited.then((code) => {
		console.error(chalk.red(`[tw-boot] Atom exited early with code ${code}`));
	});
	await waitForTcpPort("Atom", ATOM_PORT, SERVICE_HEALTH_TIMEOUT_MS);

	const capabilityServices = workerCapabilityServices(process.env);
	for (const service of capabilityServices) {
		superviseCapabilityService(repoRoot, service);
	}
	const serverProc = startServer(repoRoot, serverPort);
	let serverExited = false;
	void serverProc.exited.then((code) => {
		serverExited = true;
		if (code !== 0) {
			console.error(
				chalk.red(`[tw-boot] Autumn server exited early with code ${code}`),
			);
		}
	});

	const { workersProc, cronProc } = startBackgroundProcs(repoRoot);
	void workersProc.exited.then((code) => {
		if (code !== 0) {
			console.error(
				chalk.red(`[tw-boot] SQS workers exited early with code ${code}`),
			);
		}
	});
	void cronProc.exited.then((code) => {
		if (code !== 0) {
			console.error(chalk.red(`[tw-boot] cron exited early with code ${code}`));
		}
	});

	await waitForServerHealth(serverPort, SERVER_HEALTH_TIMEOUT_MS);

	if (serverExited) {
		throw new Error(
			"[tw-boot] Autumn server process exited before becoming healthy — aborting worker boot",
		);
	}
	await Promise.all(
		capabilityServices.map((service) =>
			waitForTcpPort(service.name, service.port, SERVICE_HEALTH_TIMEOUT_MS),
		),
	);

	log(`worker ready (env=${TW_ENV}, server :${serverPort})`);
	console.log(READY_SENTINEL);

	await Promise.all([
		serverProc.exited,
		workersProc.exited,
		cronProc.exited,
		...(balanceWorkerProc ? [balanceWorkerProc.exited] : []),
	]);
	stopCapabilityServices();
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(chalk.red(`[tw-boot] FATAL: ${(error as Error).message}`));
		stopCapabilityServices();
		process.exit(1);
	});
}
