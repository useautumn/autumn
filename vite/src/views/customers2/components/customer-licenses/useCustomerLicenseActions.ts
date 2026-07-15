import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { runWithErrorToast } from "@/views/products/plan/components/plan-licenses/runWithErrorToast";

/**
 * Wraps the pools query with entity-scoped assign/unassign handlers, toasting
 * backend errors.
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

	const attachLicense = (pool: ApiCustomerLicenseV0) => {
		if (!(customerId && entityId)) return Promise.resolve(false);
		return runWithErrorToast({
			action: () =>
				assign.mutateAsync({
					customer_id: customerId,
					plan_id: pool.license_plan_id,
					entities: [{ entity_id: entityId }],
				}),
			fallbackMessage: "Failed to assign license",
		});
	};

	const cancelLicenseAssignment = ({
		entityId: assignmentEntityId,
		licensePlanId,
	}: {
		entityId: string;
		licensePlanId: string;
	}) =>
		runWithErrorToast({
			action: () =>
				unassign.mutateAsync({
					customer_id: customerId ?? "",
					entity_ids: [assignmentEntityId],
					license_plan_id: licensePlanId,
				}),
			fallbackMessage: "Failed to unassign license",
		});

	return {
		pools,
		isLoading,
		attachLicense,
		cancelLicenseAssignment,
		isAssigning: assign.isPending,
		isUnassigning: unassign.isPending,
	};
};
