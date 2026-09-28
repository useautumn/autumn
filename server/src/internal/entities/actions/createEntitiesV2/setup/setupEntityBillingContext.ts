import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AllocatedInvoiceContext } from "@/internal/balances/utils/allocatedInvoice/allocatedInvoiceContext.js";
import { setupAllocatedInvoiceContext } from "@/internal/balances/utils/allocatedInvoice/setupAllocatedInvoiceContext.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";

/** The Stripe side of using N seats of a prorated grant; null when nothing is invoiced (free, or no subscription). */
export const setupEntityBillingContext = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateEntitiesContext;
}): Promise<AllocatedInvoiceContext | null> => {
	const [customerEntitlement] = context.invoicedCustomerEntitlements;
	if (!customerEntitlement) return null;

	const inserted = context.entitiesByFeature.find(
		({ feature }) =>
			customerEntitlement.entitlement.feature.internal_id ===
			feature.internal_id,
	)?.inserted.length;
	if (!inserted) return null;

	return setupAllocatedInvoiceContext({
		ctx,
		oldFullCustomer: context.fullCustomer,
		customerEntitlement,
		update: {
			balance: (customerEntitlement.balance ?? 0) - inserted,
			additional_balance: customerEntitlement.additional_balance ?? 0,
			adjustment: customerEntitlement.adjustment ?? 0,
			entities: customerEntitlement.entities ?? {},
			deducted: inserted,
		},
		deductionPersisted: false,
	});
};
