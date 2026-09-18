import type { MigrationRun } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { reconcileAbandonedRuns } from "./reconcileAbandonedRuns.js";

const inFlight = new Set<string>();

/** Detached reconcile for polled read paths. One pass per org/env at a time, so
 * a 2s poll cannot stack up trigger.dev round trips. */
export const reconcileAbandonedRunsOnce = async ({
	ctx,
	runs,
}: {
	ctx: AutumnContext;
	runs: MigrationRun[];
}): Promise<void> => {
	const key = `${ctx.org.id}:${ctx.env}`;
	if (inFlight.has(key)) return;
	inFlight.add(key);

	try {
		await reconcileAbandonedRuns({ ctx, runs });
	} catch (error) {
		ctx.logger.error("migration-run: detached reconcile failed", {
			data: { error: error instanceof Error ? error.message : String(error) },
		});
	} finally {
		inFlight.delete(key);
	}
};
