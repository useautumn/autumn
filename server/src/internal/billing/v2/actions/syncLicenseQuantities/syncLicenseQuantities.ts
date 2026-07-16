import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState.js";
import { computeSyncLicenseQuantitiesPlan } from "./compute/computeSyncLicenseQuantitiesPlan.js";
import { logSyncLicenseQuantitiesPlan } from "./logs/logSyncLicenseQuantitiesPlan.js";
import type { SyncLicenseQuantitiesParams } from "./types.js";

/**
 * Converges pool counters onto the Stripe subscription's seat quantities —
 * in place, never via expire+replace: seats stay anchored to the pool's
 * link and the parent customer product is untouched.
 */
export const syncLicenseQuantities = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncLicenseQuantitiesParams;
}) => {
	if (params.licenseQuantityDrifts.length === 0)
		return { success: true as const };

	// 1. Compute: absolute paid-count convergence per drifted pool
	const plan = computeSyncLicenseQuantitiesPlan({ params });
	logSyncLicenseQuantitiesPlan({ ctx, params });

	// 2. Execute
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: plan.billingPlan });

	// 3. Converge: remaining from live seat counts (may go negative) and
	// spare-row cleanup on over-allocated pools.
	await reconcileLicenseStateForCustomer({
		ctx,
		idOrInternalId: params.customerId,
		deleteCache: true,
	});

	return { success: true as const };
};
