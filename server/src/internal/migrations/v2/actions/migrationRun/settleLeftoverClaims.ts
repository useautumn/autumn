import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";

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
