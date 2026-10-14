import type { MigrationRun } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findAbandonedCandidates } from "./findAbandonedCandidates.js";
import {
	listDeadMigrationRuns,
	type TriggerLivenessCheck,
} from "./listDeadMigrationRuns.js";
import { settleAbandonedRun } from "./settleAbandonedRun.js";

export const reconcileAbandonedRuns = async ({
	ctx,
	runs,
	isTerminal,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	runs: MigrationRun[];
	isTerminal?: TriggerLivenessCheck;
	now?: number;
}): Promise<Set<string>> => {
	const candidates = findAbandonedCandidates({ runs, now });

	const dead = await listDeadMigrationRuns({
		ctx,
		runs: candidates,
		isTerminal,
	});

	const reconciled = new Set<string>();
	for (const run of dead) {
		if (await settleAbandonedRun({ ctx, run, now })) {
			reconciled.add(run.internal_id);
		}
	}

	return reconciled;
};
