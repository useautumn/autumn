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
	// 1. Runs old enough that inactivity is meaningful
	const candidates = findAbandonedCandidates({ runs, now });

	// 2. Of those, the ones trigger.dev confirms are dead
	const dead = await listDeadMigrationRuns({
		ctx,
		runs: candidates,
		isTerminal,
	});

	// 3. Settle each, skipping any that finished while we asked
	const reconciled = new Set<string>();
	for (const run of dead) {
		if (await settleAbandonedRun({ ctx, run, now })) {
			reconciled.add(run.internal_id);
		}
	}

	return reconciled;
};
