import type { DrizzleCli } from "../initDrizzle.js";

/**
 * A DB health probe: reads pg_stat_* (or similar) and emits one tagged
 * telemetry line per run for an Axiom monitor to alert on. Add a probe by
 * creating a file that exports a DbProbe and registering it in registry.ts.
 */
export type DbProbe = {
	/** Stable slug — also the `type` tag on the emitted log + the Axiom monitor key. */
	name: string;
	/** Reads the DB and emits its telemetry line. Runs on every cron tick. */
	run: (args: { db: DrizzleCli }) => Promise<void>;
};
