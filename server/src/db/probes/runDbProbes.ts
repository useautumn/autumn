import { logger } from "../../external/logtail/logtailUtils.js";
import type { DrizzleCli } from "../initDrizzle.js";
import { dbProbes } from "./registry.js";
import type { DbProbe } from "./types.js";

const PROBE_TIMEOUT_MS = 10_000;

// Single-flight: skip a tick while the previous run is still in flight, so a
// slow probe (exactly when the DB is under pressure) can't stack up ticks and
// pile connections onto the cron pool.
let running = false;

const withTimeout = <T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${ms}ms`)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const runProbe = async (
	probe: DbProbe,
	db: DrizzleCli,
	timeoutMs: number,
): Promise<void> => {
	try {
		await withTimeout(probe.run({ db }), timeoutMs, `db probe ${probe.name}`);
	} catch (error) {
		// A probe must never break the cron tick or the other probes. Pass the
		// raw Error so the structured logger keeps the stack/cause.
		logger.warn(
			{ type: "db_probe_error", probe: probe.name, err: error },
			"DB probe failed",
		);
	}
};

/** Runs every registered DB health probe once — each isolated and time-bounded. */
export const runDbProbes = async ({
	db,
	probes = dbProbes,
	timeoutMs = PROBE_TIMEOUT_MS,
}: {
	db: DrizzleCli;
	probes?: DbProbe[];
	timeoutMs?: number;
}): Promise<void> => {
	if (running) {
		logger.info(
			{ type: "db_probes_skipped" },
			"DB probes still in flight, skipping tick",
		);
		return;
	}
	running = true;
	try {
		await Promise.all(probes.map((probe) => runProbe(probe, db, timeoutMs)));
	} finally {
		running = false;
	}
};
