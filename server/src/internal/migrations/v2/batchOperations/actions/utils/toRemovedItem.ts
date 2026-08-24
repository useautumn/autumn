import type { CusProductStatus, EntitlementWithFeature } from "@autumn/shared";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { BatchMigrationRemovedItem } from "../../execute/types/batchMigrationExecutionTypes.js";

export type RemovedItemSourceRow = {
	internalCustomerId: string;
	customerProductId: string;
	entityId: string | null;
	liveBalance: number | null;
	liveNextResetAt: number | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

/** Stamps the row's own live definition and pre-write balance, so finalize
 * diffs that customer's from-state rather than a shared catalog entitlement. */
export const toRemovedItem = ({
	row,
	planId,
	fromEntitlement,
}: {
	row: RemovedItemSourceRow;
	planId: string;
	fromEntitlement: EntitlementWithFeature;
}): BatchMigrationRemovedItem => {
	const fromInitialState = computeCustomerEntitlementInitialState({
		entitlement: fromEntitlement,
	});
	return {
		internalCustomerId: row.internalCustomerId,
		customerProductId: row.customerProductId,
		entityId: row.entityId,
		planId,
		featureId: fromEntitlement.feature.id,
		entitlement: fromEntitlement,
		granted: fromInitialState.granted,
		remaining: row.liveBalance,
		unlimited: fromInitialState.unlimited === true,
		nextResetAt: row.liveNextResetAt,
		status: row.status,
		startsAt: row.startsAt,
		canceledAt: row.canceledAt,
		endedAt: row.endedAt,
		trialEndsAt: row.trialEndsAt,
	};
};
