import {
	cusEntToStartingBalance,
	type DbOverageAllowed,
	getMaxOverage,
	isAllocatedCustomerEntitlement,
	isFreeCustomerEntitlement,
	isUnlimitedCustomerEntitlement,
} from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { WorkerRollover } from "../../models/subject/rows/workerRollover.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionRow } from "../types/deductionRow.js";
import type { CreditCost } from "./resolveCreditCosts.js";

/** A free allocated grant may run over unless the caller rejects; a plan or customer control can enable or veto overage for the whole feature. */
const usageAllowedOf = ({
	customerEntitlement,
	control,
	featureHasNativeOverage,
	overageBehavior,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	control: DbOverageAllowed | undefined;
	featureHasNativeOverage: boolean;
	overageBehavior: OverageBehavior;
}): boolean => {
	const isFreeAllocated =
		isAllocatedCustomerEntitlement(customerEntitlement) &&
		isFreeCustomerEntitlement(customerEntitlement);
	const native =
		Boolean(customerEntitlement.usage_allowed) ||
		(isFreeAllocated && overageBehavior !== "reject");
	if (control?.enabled === true && !featureHasNativeOverage) return true;
	if (control?.enabled === false) return false;
	return native;
};

/** How far a row may move: down to its overage floor if usage is allowed, and on a refund back up to its grant plus adjustment. */
export const customerEntitlementToDeductionRow = ({
	customerEntitlement,
	creditCost,
	overageAllowedByFeatureId,
	nativeOverageFeatureIds,
	overageBehavior,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	creditCost: CreditCost;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeOverageFeatureIds: Set<string>;
	overageBehavior: OverageBehavior;
}): DeductionRow => {
	const featureId = customerEntitlement.entitlement.feature.id;
	const unlimited = isUnlimitedCustomerEntitlement({ customerEntitlement });
	const maxOverage = getMaxOverage({ cusEnt: customerEntitlement });
	const grant = cusEntToStartingBalance({ cusEnt: customerEntitlement });
	const usageAllowed =
		unlimited ||
		usageAllowedOf({
			customerEntitlement,
			control: overageAllowedByFeatureId[featureId],
			featureHasNativeOverage: nativeOverageFeatureIds.has(featureId),
			overageBehavior,
		});

	return {
		table: "customerEntitlements",
		id: customerEntitlement.id,
		featureId,
		balance: customerEntitlement.balance,
		creditCost: creditCost.creditCost,
		rateCard: creditCost.rateCard,
		rateUnits: creditCost.rateCard
			? (customerEntitlement.usage_attribution?.[
					creditCost.rateCard.source_internal_feature_id
				]?.units ?? 0)
			: 0,
		ownerId: customerEntitlement.id,
		usageAllowed,
		minBalance: unlimited || maxOverage === undefined ? null : -maxOverage,
		maxBalance: unlimited ? null : grant + customerEntitlement.adjustment,
		unlimited,
	};
};

/** A rollover only ever drains to zero and is never refunded into; it charges at its owner's rate. */
export const rolloverToDeductionRow = ({
	rollover,
	owner,
}: {
	rollover: WorkerRollover;
	owner: DeductionRow;
}): DeductionRow => ({
	table: "rollovers",
	id: rollover.id,
	featureId: owner.featureId,
	balance: rollover.balance,
	creditCost: owner.creditCost,
	rateCard: owner.rateCard,
	rateUnits: owner.rateUnits,
	ownerId: owner.ownerId,
	usageAllowed: false,
	minBalance: 0,
	maxBalance: 0,
	unlimited: false,
});
