/**
 * Cluster under test for the edge config proof. The primary runs exactly what
 * init.ts / workers.ts run (the relay in "new" mode, nothing in "old"), then
 * forks; each fork runs the worker boot path (startAllEdgeConfigPolling, then a
 * blue-green slot store's startPolling) and reports what it serves every 50ms.
 * Launched by runEdgeConfigProof.ts, which supplies every EDGE_PROOF_* env var.
 */
import cluster from "node:cluster";
import { ms } from "@autumn/shared";
import { z } from "zod/v4";
import { BLUE_GREEN_ACTIVE_SLOT_KEY } from "@/external/aws/s3/adminS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { ActiveSlotConfigSchema } from "@/queue/blueGreen/blueGreenSchemas.js";

type StoreModule =
	typeof import("@/internal/misc/edgeConfig/edgeConfigStore.js");
type RegistryModule =
	typeof import("@/internal/misc/edgeConfig/edgeConfigRegistry.js");
type RelayModule =
	typeof import("@/internal/misc/edgeConfig/edgeConfigRelay.js");

const mode = process.env.EDGE_PROOF_MODE;
const modulesDir = process.env.EDGE_PROOF_MODULES_DIR ?? "";
const reportUrl = process.env.EDGE_PROOF_REPORT_URL ?? "";
const forkCount = Number(process.env.EDGE_PROOF_FORKS ?? 4);
const configKeys = (process.env.EDGE_PROOF_CONFIG_KEYS ?? "").split(",");

const createConsoleLogger = (): Logger => {
	const prefix = `[${cluster.isPrimary ? "primary" : `fork ${cluster.worker?.id}`} ${process.pid}]`;
	const logger: Logger = {
		debug: () => {},
		info: (...args) => console.log(prefix, ...args),
		warn: (...args) => console.warn(prefix, "WARN", ...args),
		error: (...args) => console.error(prefix, "ERROR", ...args),
		child: () => logger,
	};
	return logger;
};
const logger = createConsoleLogger();

const runPrimary = async () => {
	if (mode === "new") {
		const { startEdgeConfigRelay } = (await import(
			`${modulesDir}/edgeConfigRelay.ts`
		)) as RelayModule;
		await startEdgeConfigRelay({ clusterModule: cluster, logger });
	}
	for (let i = 0; i < forkCount; i++) cluster.fork();

	let stopping = false;
	cluster.on("exit", (worker, code, signal) => {
		if (stopping) return;
		logger.info(`fork ${worker.id} exited (${signal ?? code}); respawning`);
		cluster.fork();
	});
	process.on("SIGTERM", () => {
		stopping = true;
		for (const worker of Object.values(cluster.workers ?? {})) worker?.kill();
		setTimeout(() => process.exit(0), 500);
	});
};

const runFork = async () => {
	const { createEdgeConfigStore } = (await import(
		`${modulesDir}/edgeConfigStore.ts`
	)) as StoreModule;
	const { registerEdgeConfig, startAllEdgeConfigPolling } = (await import(
		`${modulesDir}/edgeConfigRegistry.ts`
	)) as RegistryModule;

	const stores = configKeys.map((s3Key) => {
		const store = createEdgeConfigStore({
			s3Key,
			schema: z.object({ value: z.string() }),
			defaultValue: () => ({ value: "default" }),
		});
		registerEdgeConfig({ store });
		return store;
	});
	await startAllEdgeConfigPolling({ logger });

	// Same shape as blueGreenSlotStore.ts, built from this mode's store factory.
	const slotStore = createEdgeConfigStore({
		s3Key: BLUE_GREEN_ACTIVE_SLOT_KEY,
		schema: ActiveSlotConfigSchema,
		pollIntervalMs: ms.seconds(2),
		defaultValue: () => ({
			activeTaskDefinitionArn: null,
			activeImageSha: null,
			updatedAt: new Date(0).toISOString(),
		}),
	});
	await slotStore.startPolling({ logger });

	const probeStore = stores[0]!;
	setInterval(() => {
		void fetch(reportUrl, {
			method: "POST",
			body: JSON.stringify({
				pid: process.pid,
				workerId: cluster.worker?.id ?? 0,
				probe: probeStore.get().value,
				probeHealthy: probeStore.getStatus().healthy,
				slot: slotStore.get().activeTaskDefinitionArn,
				slotHealthy: slotStore.getStatus().healthy,
			}),
		}).catch(() => {});
	}, 50);
};

if (cluster.isPrimary) await runPrimary();
else await runFork();
