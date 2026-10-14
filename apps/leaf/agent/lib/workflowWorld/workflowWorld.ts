import { createWorld as createPostgresWorld } from "@workflow/world-postgres";
import { LISTENER_LOST_EXIT_CODE } from "./listenerLostExitCode.js";
import { createListenerRoutedPool } from "./listenerRoutedPool.js";

const positiveInt = (value: string | undefined) => {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** world-postgres never reconnects its listener, so streams would stall; leaf restarts eve instead. */
const exitForRestart = () => {
	console.error(
		"[leaf] workflow world LISTEN connection closed; exiting so leaf restarts eve",
	);
	process.exit(LISTENER_LOST_EXIT_CODE);
};

/** Every query goes through WORKFLOW_POSTGRES_URL (the bouncer); only the stream
 * LISTEN connection uses CHAT_DATABASE_DIRECT_URL, which transaction poolers can't serve. */
export const createWorld = ({
	onListenerLost = exitForRestart,
}: {
	onListenerLost?: () => void;
} = {}) => {
	const queryUrl = process.env.WORKFLOW_POSTGRES_URL;
	if (!queryUrl) {
		throw new Error("WORKFLOW_POSTGRES_URL is required for the Postgres world");
	}
	let closing = false;
	const pool = createListenerRoutedPool({
		queryUrl,
		listenUrl: process.env.CHAT_DATABASE_DIRECT_URL || queryUrl,
		max: positiveInt(process.env.WORKFLOW_POSTGRES_MAX_POOL_SIZE),
		onListenerClosed: () => {
			if (!closing) onListenerLost();
		},
	});
	const world = createPostgresWorld({
		pool,
		jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
		queueConcurrency:
			positiveInt(process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) ?? 50,
		applicationManagedShutdown:
			process.env.WORKFLOW_POSTGRES_APPLICATION_MANAGED_SHUTDOWN === "1",
	});
	return {
		...world,
		close: async () => {
			closing = true;
			try {
				await world.close?.();
			} finally {
				await pool.end();
			}
		},
	};
};
