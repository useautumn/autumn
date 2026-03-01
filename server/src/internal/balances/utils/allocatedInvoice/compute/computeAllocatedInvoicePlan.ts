import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AllocatedInvoiceContext } from "../allocatedInvoiceContext";
import { computeAllocatedInvoiceLineItems } from "./computeAllocatedInvoiceLineItems";
import { computeUpdateCustomerEntitlementPlan } from "./computeUpdateCustomerEntitlementPlan";

export const computeAllocatedInvoicePlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AllocatedInvoiceContext;
}): AutumnBillingPlan => {
	// 1. Customer entitlement plan
	const updateCustomerEntitlementPlan = computeUpdateCustomerEntitlementPlan({
		billingContext,
	});

	// 2. Line items plan
	const lineItems = computeAllocatedInvoiceLineItems({
		ctx,
		billingContext,
	});

	return {
		updateCustomerEntitlements: updateCustomerEntitlementPlan
			? [updateCustomerEntitlementPlan]
			: [],
		lineItems,
		insertCustomerProducts: [],
	};
};
