import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";

/** Leftover `running` claims hold the live-item mutex; settle them whenever
 * a run is provably done executing (terminal transition, or a canceled run
 * whose trigger task is confirmed dead) so other migrations aren't blocked. */
export const settleLeftoverClaims = async ({
	ctx,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
}) => {
	try {
		const settled = await migrationItemRunRepo.settleLiveForRun({
			ctx,
			migrationRunId,
		});
		if (settled > 0) {
			ctx.logger.warn("migration-run: settled leftover running claims", {
				data: { migrationRunId, settled },
			});
		}
	} catch (error) {
		ctx.logger.error("migration-run: failed to settle leftover claims", {
			data: {
				migrationRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
