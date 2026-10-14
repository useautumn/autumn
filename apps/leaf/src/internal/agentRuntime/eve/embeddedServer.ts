import { ms } from "@autumn/shared";
import { $ } from "bun";
import { logger } from "../../../lib/logger.js";
import { durableWorldEnv, selectDurableWorld } from "./durableWorld.js";
import { setEmbeddedEveStatus } from "./embeddedStatus.js";
import { logProcessMemory } from "./logProcessMemory.js";
import { createRestartBudget } from "./restartBudget.js";
import { superviseEve } from "./superviseEve.js";

const EVE_PORT = process.env.EVE_PORT ?? "3999";
const CHAT_PORT = process.env.CHAT_PORT ?? process.env.PORT ?? "3099";
const EVE_HOST = process.env.EVE_HOST ?? "127.0.0.1";
/** srvx's Bun adapter is Bun.serve, whose idle timeout reaps quiet streams. */
const EVE_SERVER_PRESET = "node-server";
const READY_POLL_MS = 1000;
const DURABLE_WORLD_WORKER_CONCURRENCY = "10";
const DURABLE_WORLD_MAX_POOL_SIZE = "6";
const NOT_READY_WARN_EVERY_MS = 30_000;

const logBuiltServerPreset = async (leafRoot: string) => {
	try {
		const manifest = (await Bun.file(
			`${leafRoot}.output/nitro.json`,
		).json()) as { preset?: string };
		const level = manifest.preset === EVE_SERVER_PRESET ? "info" : "warn";
		logger[level]("Built embedded eve server", {
			event: "leaf.eve_server_built",
			data: { expected_preset: EVE_SERVER_PRESET, preset: manifest.preset },
		});
	} catch (error) {
		logger.warn("Could not read the embedded eve build manifest", {
			event: "leaf.eve_server_build_manifest_unreadable",
			error,
		});
	}
};

const waitForEveReady = async ({
	eve,
}: {
	eve: { exitCode: number | null };
}) => {
	const url = `http://${EVE_HOST}:${EVE_PORT}/eve/v1/info`;
	const startedAt = Date.now();
	let lastWarnedAt = startedAt;
	while (true) {
		if (eve.exitCode !== null) return;
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (response.status < 500) break;
		} catch {}
		if (Date.now() - lastWarnedAt >= NOT_READY_WARN_EVERY_MS) {
			lastWarnedAt = Date.now();
			logger.warn("Embedded eve server still not ready", {
				event: "leaf.eve_server_not_ready",
				data: { elapsed_ms: Date.now() - startedAt },
			});
		}
		await Bun.sleep(READY_POLL_MS);
	}
	setEmbeddedEveStatus("ready");
	logger.info("Embedded eve server ready", {
		event: "leaf.eve_server_ready",
		data: { ready_ms: Date.now() - startedAt },
	});
};

const LISTENER_RESTART_BUDGET = {
	maxRestarts: 5,
	windowMs: ms.hours(1),
	baseDelayMs: ms.seconds(1),
	maxDelayMs: ms.seconds(30),
};

const exitLeafWithEve = async (code: number) => {
	logger.error(
		"Embedded eve server exited; leaf follows so the task restarts",
		{
			data: { code },
			event: "leaf.eve_process_exited",
		},
	);
	await logger.flush?.();
	process.exit(code === 0 ? 0 : 1);
};

/** Runs eve inside the leaf task over loopback, so prod needs no extra
 * service. Build and runtime get the same env: eve picks its world at build. */
export const startEmbeddedEveServer = async () => {
	const leafRoot = new URL("../../../../", import.meta.url).pathname;
	let builtWorld: "durable" | "local" | undefined;
	let evePid: number | undefined;
	logProcessMemory({ evePid: () => evePid });

	const start = async ({ allowDurable }: { allowDurable: boolean }) => {
		setEmbeddedEveStatus("starting");
		const world = allowDurable
			? await selectDurableWorld({
					chatDatabaseUrl: process.env.CHAT_DATABASE_URL,
					chatDatabaseDirectUrl: process.env.CHAT_DATABASE_DIRECT_URL,
				})
			: undefined;
		logger.info("Starting embedded eve server", {
			event: "leaf.eve_server_starting",
			data: {
				durable_journal: Boolean(world),
				direct_listener: Boolean(world && world.listenUrl !== world.queryUrl),
				queue_namespace: process.env.WORKFLOW_QUEUE_NAMESPACE,
			},
		});
		const eveEnv = durableWorldEnv({
			env: process.env,
			world,
			workerConcurrency: DURABLE_WORLD_WORKER_CONCURRENCY,
			maxPoolSize: DURABLE_WORLD_MAX_POOL_SIZE,
		});
		const worldKind = world ? "durable" : "local";
		if (builtWorld !== worldKind) {
			await $`bunx eve build`
				.cwd(leafRoot)
				.env({ ...eveEnv, CHAT_PORT, NITRO_PRESET: EVE_SERVER_PRESET });
			await logBuiltServerPreset(leafRoot);
			if (world) {
				// `workflow-postgres-setup` is now a stub that always exits 1.
				await $`bunx --package @workflow/world-postgres bootstrap`
					.cwd(leafRoot)
					.env(eveEnv);
			}
			builtWorld = worldKind;
		}
		const eve = Bun.spawn({
			cmd: ["bun", ".output/server/index.mjs"],
			cwd: leafRoot,
			env: {
				...eveEnv,
				CHAT_PORT,
				NITRO_HOST: EVE_HOST,
				NITRO_PORT: EVE_PORT,
				PORT: EVE_PORT,
			},
			stderr: "inherit",
			stdout: "inherit",
		});
		evePid = eve.pid;
		void waitForEveReady({ eve });
		return eve;
	};

	await superviseEve({
		start,
		budget: createRestartBudget(LISTENER_RESTART_BUDGET),
		exitLeaf: exitLeafWithEve,
	});
};
