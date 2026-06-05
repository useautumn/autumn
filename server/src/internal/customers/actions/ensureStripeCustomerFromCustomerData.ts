import type { Customer, CustomerData } from "@autumn/shared";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerData as updateCachedFullSubjectCustomerData } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerData.js";
import { updateCachedCustomerData as updateCachedFullCustomerData } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/updateCachedCustomerData.js";

export const ensureStripeCustomerFromCustomerData = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
}) => {
	if (!customerData?.create_in_stripe || customer.processor?.id) return false;

	if (customer.processor?.id) return true;

	await getOrCreateStripeCustomer({
		ctx,
		customer,
	});

	if (!customer.processor?.id) return false;

	const customerId = customer.id || customer.internal_id;
	await Promise.all([
		updateCachedFullCustomerData({
			ctx,
			customerId,
			updates: { processor: customer.processor },
		}),
		updateCachedFullSubjectCustomerData({
			ctx,
			customerId,
			updates: { processor: customer.processor },
		}),
	]);

	return true;
};
