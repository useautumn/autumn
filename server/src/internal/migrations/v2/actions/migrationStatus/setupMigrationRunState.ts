import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isTriggerConfigured } from "@/trigger/configureTrigger.js";
import { migrationRunRepo } from "../../repos/index.js";
import { reconcileAbandonedRunsOnce } from "../migrationRun/reconcileAbandonedRunsOnce.js";
import type { MigrationRunState } from "./types/migrationRunState.js";

export const setupMigrationRunState = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: AutumnContext;
	migrationInternalIds: string[];
}): Promise<MigrationRunState> => {
	const [orgActiveRuns, latestRuns] = await Promise.all([
		migrationRunRepo.list({ ctx, active: true }),
		migrationRunRepo.listLatestByKind({ ctx, migrationInternalIds }),
	]);

	if (isTriggerConfigured()) {
		void reconcileAbandonedRunsOnce({ ctx, runs: orgActiveRuns });
	}

	return { orgActiveRuns, latestRuns };
};
