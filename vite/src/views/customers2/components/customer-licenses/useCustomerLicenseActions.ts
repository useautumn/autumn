import type { LicenseBalanceResponse } from "@autumn/shared";
import { useState } from "react";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { runWithErrorToast } from "@/views/products/plan/components/plan-licenses/runWithErrorToast";

/**
 * Wraps the pools query with entity-scoped assign/unassign handlers, toasting
 * backend errors. `parent_plan_id` targets the exact pool the user acted on.
 */
export const useCustomerLicenseActions = ({
	customerId,
	entityId,
}: {
	customerId?: string;
	entityId?: string;
}) => {
	const { pools, isLoading, assign, unassign } = useLicenseBalancesQuery({
		customerId,
		entityId,
		enabled: Boolean(entityId),
	});

	// The assign/unassign mutations are shared across rows, so track which pool
	// is acting to scope pending state to that row alone.
	const [pendingPoolId, setPendingPoolId] = useState<string | null>(null);

	const runForPool = async ({
		poolId,
		action,
		errorMessage,
	}: {
		poolId: string;
		action: () => Promise<unknown>;
		errorMessage: string;
	}) => {
		setPendingPoolId(poolId);
		try {
			return await runWithErrorToast({ action, fallbackMessage: errorMessage });
		} finally {
			setPendingPoolId(null);
		}
	};

	const attachLicense = (pool: LicenseBalanceResponse) => {
		if (!(customerId && entityId)) return Promise.resolve(false);
		return runForPool({
			poolId: pool.parent_plan_id,
			action: () =>
				assign.mutateAsync({
					customer_id: customerId,
					entity_id: entityId,
					plan_id: pool.license_plan_id,
					parent_plan_id: pool.parent_plan_id,
				}),
			errorMessage: "Failed to assign license",
		});
	};

	const cancelLicenseAssignment = ({
		pool,
		assignmentId,
	}: {
		pool: LicenseBalanceResponse;
		assignmentId: string;
	}) =>
		runForPool({
			poolId: pool.parent_plan_id,
			action: () =>
				unassign.mutateAsync({
					customer_id: customerId ?? "",
					assignment_id: assignmentId,
				}),
			errorMessage: "Failed to unassign license",
		});

	return {
		pools,
		isLoading,
		attachLicense,
		cancelLicenseAssignment,
		pendingPoolId,
		isAssigning: assign.isPending,
		isUnassigning: unassign.isPending,
	};
};
