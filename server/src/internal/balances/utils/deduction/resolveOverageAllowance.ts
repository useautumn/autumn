import {
	type DbOverageAllowed,
	type FullCusEntWithFullCusProduct,
	isAllocatedCustomerEntitlement,
	isFreeCustomerEntitlement,
} from "@autumn/shared";
import type {
	DeductionOptions,
	OveragePriority,
} from "../types/deductionTypes.js";

/**
 * Whether a row may go below zero, and where it sits in the overage pass.
 * A row with its own overage (a usage price, a plan or customer control) takes
 * overage before a free allocated grant, so a priced add-on bills the units a
 * free plan's grant would otherwise absorb.
 */
export const resolveOverageAllowance = ({
	customerEntitlement,
	overageBehaviour,
	overageAllowedControl,
	featureHasNativeOverage,
	unlimited,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	overageBehaviour: NonNullable<DeductionOptions["overageBehaviour"]>;
	overageAllowedControl: DbOverageAllowed | undefined;
	featureHasNativeOverage: boolean;
	unlimited: boolean;
}): { usageAllowed: boolean; overagePriority: OveragePriority } => {
	const controlVetoesOverage = overageAllowedControl?.enabled === false;
	const controlEnablesOverage =
		overageAllowedControl?.enabled === true && !featureHasNativeOverage;

	const hasOwnOverage =
		unlimited ||
		(!controlVetoesOverage &&
			(controlEnablesOverage || Boolean(customerEntitlement.usage_allowed)));

	const freeAllocatedMayRunOver =
		!controlVetoesOverage &&
		overageBehaviour !== "reject" &&
		isFreeCustomerEntitlement(customerEntitlement) &&
		isAllocatedCustomerEntitlement(customerEntitlement);

	if (hasOwnOverage) return { usageAllowed: true, overagePriority: 0 };
	if (freeAllocatedMayRunOver)
		return { usageAllowed: true, overagePriority: 1 };
	return { usageAllowed: false, overagePriority: 2 };
};
