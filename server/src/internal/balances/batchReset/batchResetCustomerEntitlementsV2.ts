import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { classifyBatchResetContext } from "./compute/classifyBatchResetContext.js";
import { computeResetMutations } from "./compute/computeResets/computeResetMutations.js";
import { computeVerdictMutations } from "./compute/computeVerdictMutations.js";
import { executeResetMutations } from "./execute/executeResetMutations.js";
import { executeVerdictMutations } from "./execute/executeVerdictMutations.js";
import { invalidateResetCaches } from "./execute/invalidateResetCaches.js";
import { logBatchCustomerEntitlementsV2 } from "./logs/logBatchCustomerEntitlementsV2.js";
import { setupBatchResetContext } from "./setup/setupBatchResetContext.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "./types.js";

/**
 * SQS handler: hydrates scanned customer entitlement IDs, builds one context
 * per org+env, classifies every candidate, then computes and persists batched
 * verdict and reset mutations.
 */
export const batchResetCustomerEntitlementsV2 = async ({
	db,
	logger,
	payload,
}: {
	db: DrizzleCli;
	logger: Logger;
	payload: BatchResetCustomerEntitlementsV2Payload;
}) => {
	const batchResetContext = await setupBatchResetContext({
		db,
		logger,
		payload,
	});

	const classifiedBatchResetContext = classifyBatchResetContext({
		batchResetContext,
	});

	const verdictMutations = computeVerdictMutations({
		verdicts: classifiedBatchResetContext.verdicts,
	});

	const resetMutations = await computeResetMutations({
		resetGroups: classifiedBatchResetContext.resetGroups,
	});

	logBatchCustomerEntitlementsV2({
		logger,
		payload,
		batchResetContext,
		classifiedBatchResetContext,
		verdictMutations,
		resetMutations,
	});

	await executeVerdictMutations({ db, verdictMutations });
	const { appliedCustomerEntitlementIds, staleSkippedCount } =
		await executeResetMutations({ db, resetMutations });

	if (staleSkippedCount > 0) {
		// A concurrent reset (usually a lazy reset racing this worker) won —
		// the guarded UPDATE skipped those rows instead of double-applying.
		logger.info("[batchReset] stale mutations skipped", {
			jobName: "reset-cus-ents-v2",
			data: { staleSkippedCount },
		});
	}

	const appliedResetMutations = resetMutations.filter(
		({ customerEntitlementId }) =>
			appliedCustomerEntitlementIds.has(customerEntitlementId),
	);

	// Postgres is authoritative now — drop the stale Redis state so the next
	// read rehydrates instead of serving pre-reset balances.
	await invalidateResetCaches({
		resetGroups: classifiedBatchResetContext.resetGroups,
		resetMutations: appliedResetMutations,
	});

	return {
		...classifiedBatchResetContext,
		verdictMutations,
		resetMutations,
		appliedResetMutations,
	};
};
