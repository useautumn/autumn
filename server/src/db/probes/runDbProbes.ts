import { logger } from "../../external/logtail/logtailUtils.js";
import type { DrizzleCli } from "../initDrizzle.js";
import { dbProbes } from "./registry.js";
import type { DbProbe } from "./types.js";

const runProbe = async (probe: DbProbe, db: DrizzleCli): Promise<void> => {
	try {
		await probe.run({ db });
	} catch (error) {
		// A probe must never break the cron tick or the other probes.
		logger.warn(
			{ type: "db_probe_error", probe: probe.name, error: String(error) },
			"DB probe failed",
		);
	}
};

/** Runs every registered DB health probe once, each isolated from the others. */
export const runDbProbes = async ({
	db,
}: {
	db: DrizzleCli;
}): Promise<void> => {
	await Promise.all(dbProbes.map((probe) => runProbe(probe, db)));
};
