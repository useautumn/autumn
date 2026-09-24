import type {
	BillingDetailsParams,
	Customer,
	CustomerData,
} from "@autumn/shared";
import { updateStripeBillingDetails } from "@/external/stripe/customers/billingDetails/operations/updateStripeBillingDetails.js";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerData as updateCachedFullSubjectCustomerData } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerData.js";

const createLinkedStripeCustomer = async ({
	ctx,
	customer,
}: {
	ctx: AutumnContext;
	customer: Customer;
}) => {
	await getOrCreateStripeCustomer({
		ctx,
		customer,
	});

	if (!customer.processor?.id) return;

	await updateCachedFullSubjectCustomerData({
		ctx,
		customerId: customer.id || customer.internal_id,
		updates: { processor: customer.processor },
	});
};

export const ensureStripeCustomerFromCustomerData = async ({
	ctx,
	customer,
	customerData,
	billingDetails,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
	billingDetails?: BillingDetailsParams;
}) => {
	const needsStripeCustomer =
		customerData?.create_in_stripe || billingDetails !== undefined;

	if (needsStripeCustomer && !customer.processor?.id) {
		await createLinkedStripeCustomer({ ctx, customer });
	}

	const stripeCustomerId = customer.processor?.id;
	if (billingDetails && stripeCustomerId) {
		await updateStripeBillingDetails({ ctx, stripeCustomerId, billingDetails });
	}
};
