import type {
	AutumnBillingPlan,
	FullCusEntWithFullCusProduct,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";
import { computeAllocatedInvoiceLineItems } from "./computeAllocatedInvoiceLineItems";
import { computeUpdateCustomerEntitlementPlan } from "./computeUpdateCustomerEntitlementPlan";

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
	const updateCustomerEntitlementPlan = computeUpdateCustomerEntitlementPlan({
		billingContext,
	});

	if (!updateCustomerEntitlementPlan) return undefined;

	billingContext.updatedCustomerEntitlement = applyEntitlementPlanToCusEnt({
		cusEnt: billingContext.updatedCustomerEntitlement,
		plan: updateCustomerEntitlementPlan,
	});

	let lineItems = computeAllocatedInvoiceLineItems({
		ctx,
		billingContext,
	});

	if (billingContext.stripeDiscounts?.length) {
		lineItems = applyStripeDiscountsToLineItems({
			lineItems,
			discounts: billingContext.stripeDiscounts,
		});
	}

	return {
		customerId: billingContext.fullCustomer?.id ?? "",
		updateCustomerEntitlements: [updateCustomerEntitlementPlan],
		lineItems,
		insertCustomerProducts: [],
	};
};
