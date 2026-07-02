import type { LicensePoolResponse } from "@autumn/shared";
import { useState } from "react";
import { useLicensePoolsQuery } from "@/hooks/queries/useLicensePoolsQuery";
import { runWithErrorToast } from "@/views/products/plan/components/plan-licenses/runWithErrorToast";

/**
 * Wraps the pools query with entity-scoped assign/unassign handlers, toasting
 * backend errors. `pool_id` targets the exact pool the user acted on.
 */
export const useCustomerLicenseActions = ({
	customerId,
	entityId,
}: {
	customerId?: string;
	entityId?: string;
}) => {
	const { pools, isLoading, assign, unassign } = useLicensePoolsQuery({
		customerId,
		entityId,
		enabled: Boolean(entityId),
	});

	// The assign/unassign mutations are shared across rows, so track which pool
	// is acting to scope pending state to that row alone.
	const [pendingPoolId, setPendingPoolId] = useState<string | null>(null);

	const assignLicense = async (pool: LicensePoolResponse) => {
		if (!(customerId && entityId)) return;
		setPendingPoolId(pool.pool_id);
		try {
			return await runWithErrorToast(
				() =>
					assign.mutateAsync({
						customer_id: customerId,
						entity_id: entityId,
						plan_id: pool.license_product_id,
						pool_id: pool.pool_id,
					}),
				"Failed to assign license",
			);
		} finally {
			setPendingPoolId(null);
		}
	};

	const unassignLicense = async ({
		pool,
		assignmentId,
	}: {
		pool: LicensePoolResponse;
		assignmentId: string;
	}) => {
		setPendingPoolId(pool.pool_id);
		try {
			return await runWithErrorToast(
				() => unassign.mutateAsync({ assignment_id: assignmentId }),
				"Failed to unassign license",
			);
		} finally {
			setPendingPoolId(null);
		}
	};

	return {
		pools,
		isLoading,
		assignLicense,
		unassignLicense,
		pendingPoolId,
		isAssigning: assign.isPending,
		isUnassigning: unassign.isPending,
	};
};
