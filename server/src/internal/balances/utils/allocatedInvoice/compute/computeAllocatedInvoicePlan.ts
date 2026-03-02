import type {
	AutumnBillingPlan,
	FullCusEntWithFullCusProduct,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";
import { computeAllocatedInvoiceLineItems } from "./computeAllocatedInvoiceLineItems";
import { computeUpdateCustomerEntitlementPlan } from "./computeUpdateCustomerEntitlementPlan";

/**
 * Applies the replaceable/balance changes from the entitlement plan
 * to produce the final post-replaceable customer entitlement snapshot.
 */
const applyEntitlementPlanToCusEnt = ({
	cusEnt,
	plan,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	plan: UpdateCustomerEntitlement;
}): FullCusEntWithFullCusProduct => {
	const { balanceChange = 0, insertReplaceables, deletedReplaceables } = plan;

	let replaceables = cusEnt.replaceables ?? [];

	if (insertReplaceables && insertReplaceables.length > 0) {
		replaceables = [
			...replaceables,
			...insertReplaceables.map((r) => ({
				...r,
				delete_next_cycle: r.delete_next_cycle ?? true,
				from_entity_id: r.from_entity_id ?? null,
			})),
		];
	}

	if (deletedReplaceables && deletedReplaceables.length > 0) {
		const deletedIds = new Set(deletedReplaceables.map((r) => r.id));
		replaceables = replaceables.filter((r) => !deletedIds.has(r.id));
	}

	return {
		...cusEnt,
		balance: (cusEnt.balance ?? 0) + balanceChange,
		replaceables,
	};
};

export const computeAllocatedInvoicePlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AllocatedInvoiceContext;
}): AutumnBillingPlan | undefined => {
	// 1. Compute replaceable / balance changes
	const updateCustomerEntitlementPlan = computeUpdateCustomerEntitlementPlan({
		billingContext,
	});

	if (!updateCustomerEntitlementPlan) return undefined;

	billingContext.updatedCustomerEntitlement = applyEntitlementPlanToCusEnt({
		cusEnt: billingContext.updatedCustomerEntitlement,
		plan: updateCustomerEntitlementPlan,
	});

	// 3. Compute line items using the post-replaceable entitlement
	const lineItems = computeAllocatedInvoiceLineItems({
		ctx,
		billingContext,
	});

	return {
		updateCustomerEntitlements: [updateCustomerEntitlementPlan],
		lineItems,
		insertCustomerProducts: [],
	};
};
