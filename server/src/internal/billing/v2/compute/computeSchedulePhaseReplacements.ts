import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductAddOn,
} from "@autumn/shared";
import {
	getDeleteCustomerProducts,
	getExpiredUpdatedCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

// Two customer products share a schedule slot when one can stand in for the
// other on the customer: same entity scope, same group, add-ons keyed on their
// own product so they never absorb a main plan's slot. Timing is part of the
// slot — a plan starting now never stands in for one a future phase is waiting
// on, so retiring that future plan drops its phase instead of rewriting it.
const scheduleSlotKey = (customerProduct: FullCusProduct) =>
	[
		customerProduct.internal_entity_id ?? "customer",
		customerProduct.product.group ?? "",
		isCustomerProductAddOn(customerProduct)
			? customerProduct.product.id
			: "main",
		customerProduct.status === CusProductStatus.Scheduled
			? "scheduled"
			: "current",
	].join(":");

const findSuccessorsBySlot = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const successorsBySlot = new Map<string, FullCusProduct>();
	for (const inserted of autumnBillingPlan.insertCustomerProducts ?? []) {
		const slot = scheduleSlotKey(inserted);
		if (!successorsBySlot.has(slot)) successorsBySlot.set(slot, inserted);
	}
	return successorsBySlot;
};

/**
 * Schedule phases store raw customer product ids, so any plan that replaces a
 * product has to hand its phases the successor. Expiring without a successor is
 * left alone — the row still resolves, so the phase keeps its history; a deleted
 * row leaves nothing to point at and is dropped from the phase.
 */
export const computeSchedulePhaseReplacements = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): NonNullable<
	AutumnBillingPlan["schedulePhaseCustomerProductReplacements"]
> => {
	const expiredCustomerProducts = getExpiredUpdatedCustomerProducts({
		autumnBillingPlan,
	});
	const deletedCustomerProducts = getDeleteCustomerProducts({
		autumnBillingPlan,
	});
	if (expiredCustomerProducts.length + deletedCustomerProducts.length === 0)
		return [];

	const successorsBySlot = findSuccessorsBySlot({ autumnBillingPlan });

	const seenCustomerProductIds = new Set<string>();
	const replacements: NonNullable<
		AutumnBillingPlan["schedulePhaseCustomerProductReplacements"]
	> = [];

	const addReplacement = ({
		retired,
		dropWithoutSuccessor,
	}: {
		retired: FullCusProduct;
		dropWithoutSuccessor: boolean;
	}) => {
		if (seenCustomerProductIds.has(retired.id)) return;
		const successor = successorsBySlot.get(scheduleSlotKey(retired));
		if (!successor && !dropWithoutSuccessor) return;

		seenCustomerProductIds.add(retired.id);
		replacements.push({
			oldCustomerProductId: retired.id,
			newCustomerProductId: successor?.id ?? null,
			internalCustomerId: retired.internal_customer_id,
			internalEntityId: retired.internal_entity_id,
		});
	};

	for (const deleted of deletedCustomerProducts)
		addReplacement({ retired: deleted, dropWithoutSuccessor: true });

	for (const expired of expiredCustomerProducts)
		addReplacement({ retired: expired, dropWithoutSuccessor: false });

	return replacements;
};
