import type { EntitlementWithFeature } from "@autumn/shared";
import {
	buildEntitlementLookup,
	buildOneOffByPlanId,
} from "../finalize/planChanges/buildBatchMigrationPlanChanges.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";

/** Fills what an op's row left out from the plan it ran under, so a recorded
 * change is self-describing. A row that carries its own value keeps it. */
export const planSnapshots = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}) => {
	const entitlementByPlanFeature = buildEntitlementLookup({ plan });
	const oneOffByPlanId = buildOneOffByPlanId({ plan });

	const entitlement = ({
		planId,
		featureId,
		entitlement,
	}: {
		planId: string;
		featureId: string;
		entitlement?: EntitlementWithFeature;
	}): EntitlementWithFeature => {
		const snapshot =
			entitlement ?? entitlementByPlanFeature.get(`${planId}:${featureId}`);
		if (!snapshot)
			throw new Error(
				`batch-migration: missing entitlement snapshot for ${planId}:${featureId}`,
			);
		return snapshot;
	};

	const isOneOff = ({
		planId,
		isOneOff,
	}: {
		planId: string;
		isOneOff?: boolean;
	}): boolean => {
		const snapshot = isOneOff ?? oneOffByPlanId.get(planId);
		if (snapshot === undefined)
			throw new Error(`batch-migration: missing plan snapshot for ${planId}`);
		return snapshot;
	};

	return { entitlement, isOneOff };
};
