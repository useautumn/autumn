import { $ } from "bun";
import { logger } from "../../../lib/logger.js";
import { setEmbeddedEveStatus } from "./embeddedStatus.js";

const EVE_PORT = process.env.EVE_PORT ?? "3999";
// Leaf's own listen port — eve's MCP connection dials leaf back on loopback.
const CHAT_PORT = process.env.CHAT_PORT ?? process.env.PORT ?? "3099";

/** Runs eve inside the leaf task: leaf reaches it over loopback, matching
 * EVE_SERVER_URL's default, so prod needs no extra service or domain. */
const logBuiltServerPreset = async (leafRoot: string) => {
	try {
		const manifest = (await Bun.file(
			`${leafRoot}.output/nitro.json`,
		).json()) as {
			preset?: string;
		};
		logger.info("Built embedded eve server", {
			event: "leaf.eve_server_built",
			data: { preset: manifest.preset },
		});
	} catch (error) {
		logger.warn("Could not read the embedded eve build manifest", {
			event: "leaf.eve_server_build_manifest_unreadable",
			data: { error: String(error) },
		});
	}
};

const waitForEveReady = async () => {
	const url = `http://${process.env.EVE_HOST ?? "127.0.0.1"}:${EVE_PORT}/eve/v1/info`;
	while (true) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (response.status < 500) break;
		} catch {}
		await Bun.sleep(1000);
	}
	setEmbeddedEveStatus("ready");
	logger.info("Embedded eve server ready", { event: "leaf.eve_server_ready" });
};

export const startEmbeddedEveServer = async () => {
	setEmbeddedEveStatus("starting");
	const leafRoot = new URL("../../../../", import.meta.url).pathname;
	// Session journals go to the chat DB (namespaced schemas) so they survive
	// redeploys; unset both vars and sessions fall back to ephemeral local files.
	const workflowPostgresUrl =
		process.env.WORKFLOW_POSTGRES_URL ?? process.env.CHAT_DATABASE_URL;
	// eve build bakes the connection URL into the manifest, so CHAT_PORT must
	// be set here — setting it only on the runtime spawn below is too late.
	// Pin the node adapter: srvx's Bun adapter is Bun.serve, whose default
	// idleTimeout reaps every quiet session stream after ~12s.
	await $`bunx eve build`
		.cwd(leafRoot)
		.env({ ...process.env, CHAT_PORT, NITRO_PRESET: "node-server" });
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
			NITRO_HOST: process.env.EVE_HOST ?? "127.0.0.1",
			NITRO_PORT: EVE_PORT,
			PORT: EVE_PORT,
		},
		stderr: "inherit",
		stdout: "inherit",
	});
	void waitForEveReady();
	// Fail fast so the supervisor restarts the task with both servers in sync.
	eve.exited.then(async (code) => {
		setEmbeddedEveStatus("down");
		logger.error("Embedded eve server exited", {
			data: { code },
			event: "leaf.eve_process_exited",
		});
		await logger.flush?.();
		process.exit(code === 0 ? 0 : 1);
	});
};
