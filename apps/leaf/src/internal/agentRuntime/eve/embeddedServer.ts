import { $ } from "bun";
import { logger } from "../../../lib/logger.js";
import { setEmbeddedEveStatus } from "./embeddedStatus.js";

const EVE_PORT = process.env.EVE_PORT ?? "3999";
const CHAT_PORT = process.env.CHAT_PORT ?? process.env.PORT ?? "3099";
const EVE_HOST = process.env.EVE_HOST ?? "127.0.0.1";
/** srvx's Bun adapter is Bun.serve, whose idle timeout reaps quiet streams. */
const EVE_SERVER_PRESET = "node-server";
const READY_POLL_MS = 1000;
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

const waitForEveReady = async () => {
	const url = `http://${EVE_HOST}:${EVE_PORT}/eve/v1/info`;
	const startedAt = Date.now();
	let lastWarnedAt = startedAt;
	while (true) {
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

/** Runs eve inside the leaf task over loopback, so prod needs no extra
 * service. CHAT_PORT must be set at build time: eve bakes it into the manifest. */
export const startEmbeddedEveServer = async () => {
	setEmbeddedEveStatus("starting");
	const leafRoot = new URL("../../../../", import.meta.url).pathname;
	const workflowPostgresUrl =
		process.env.WORKFLOW_POSTGRES_URL ?? process.env.CHAT_DATABASE_URL;
	logger.info("Starting embedded eve server", {
		event: "leaf.eve_server_starting",
		data: {
			allow_shared_world: process.env.EVE_ALLOW_SHARED_WORLD === "1",
			durable_journal: Boolean(workflowPostgresUrl),
			queue_namespace: process.env.WORKFLOW_QUEUE_NAMESPACE,
		},
	});
	await $`bunx eve build`
		.cwd(leafRoot)
		.env({ ...process.env, CHAT_PORT, NITRO_PRESET: EVE_SERVER_PRESET });
	await logBuiltServerPreset(leafRoot);
	if (workflowPostgresUrl) {
		await $`bunx workflow-postgres-setup`
			.cwd(leafRoot)
			.env({ ...process.env, WORKFLOW_POSTGRES_URL: workflowPostgresUrl });
	}
	const eve = Bun.spawn({
		cmd: ["bun", ".output/server/index.mjs"],
		cwd: leafRoot,
		env: {
			...process.env,
			...(workflowPostgresUrl
				? { WORKFLOW_POSTGRES_URL: workflowPostgresUrl }
				: {}),
			CHAT_PORT,
			NITRO_HOST: EVE_HOST,
			NITRO_PORT: EVE_PORT,
			PORT: EVE_PORT,
		},
		stderr: "inherit",
		stdout: "inherit",
	});
	void waitForEveReady();
	eve.exited.then(async (code) => {
		setEmbeddedEveStatus("down");
		logger.error(
			"Embedded eve server exited; leaf follows so the task restarts",
			{
				data: { code },
				event: "leaf.eve_process_exited",
			},
		);
		await logger.flush?.();
		process.exit(code === 0 ? 0 : 1);
	});
};
