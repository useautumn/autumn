import {
	type EntitlementWithFeature,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isResettingEntitlement,
} from "@autumn/shared";
import { initCustomerEntitlementFields } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementFields";
import type { BasePriceOperation } from "../../../types/basePriceOperationTypes";
import type { CustomerEntitlementCycleOperation } from "../../../types/customerEntitlementCycleOperationTypes";

export const computeCustomerEntitlementCycleOperations = ({
	basePriceOperation,
	candidateOutgoingEntitlements,
	initContext,
	initOptions,
}: {
	basePriceOperation: BasePriceOperation | undefined;
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	initContext: InitCustomerEntitlementContext;
	initOptions: InitFullCustomerProductOptions;
}): CustomerEntitlementCycleOperation[] => {
	if (basePriceOperation?.type !== "add") return [];

	const operations = new Map<string, CustomerEntitlementCycleOperation>();
	for (const entitlement of candidateOutgoingEntitlements) {
		if (!isResettingEntitlement({ entitlement })) continue;

		const initialized = initCustomerEntitlementFields({
			initContext,
			initOptions,
			entitlement,
		});
		const resetCycleAnchor = initialized.reset_cycle_anchor;
		const nextResetAt = initialized.next_reset_at;
		if (
			typeof resetCycleAnchor !== "number" ||
			typeof nextResetAt !== "number"
		) {
			continue;
		}

		const key = `${resetCycleAnchor}:${nextResetAt}`;
		const operation: CustomerEntitlementCycleOperation = operations.get(key) ?? {
				entitlementIds: [],
				resetCycleAnchor,
				nextResetAt,
			};
		operation.entitlementIds.push(entitlement.id);
		operations.set(key, operation);
	}

	return [...operations.values()];
};
