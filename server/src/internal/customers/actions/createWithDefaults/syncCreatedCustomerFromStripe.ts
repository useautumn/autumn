import { CustomerExpand, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoSyncStripeCustomerWithLock } from "@/internal/billing/v2/actions/sync/autoSyncStripeCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";

export const syncCreatedCustomerFromStripe = async ({
	ctx,
	fullCustomer,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	stripeCustomerId?: string | null;
}) => {
	if (!stripeCustomerId) return fullCustomer;

	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	await autoSyncStripeCustomerWithLock({
		ctx,
		customerId,
		stripeCustomerId,
	});
	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
		expand: [CustomerExpand.Invoices],
	});
};
