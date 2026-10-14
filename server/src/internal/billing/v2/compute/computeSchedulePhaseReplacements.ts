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
