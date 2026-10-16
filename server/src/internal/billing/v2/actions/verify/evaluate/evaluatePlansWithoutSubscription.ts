import {
	ACTIVE_STATUSES,
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	filterCustomerProductsByProcessorType,
	isCustomerProductRevertingTrial,
	isFreeProduct,
	isOneOffProduct,
	notNullish,
	ProcessorType,
	type SubscriptionMismatch,
} from "@autumn/shared";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";
import { customerProductHasPaidLicenses } from "@/internal/billing/v2/utils/customerProductHasPaidLicenses";

/** The plan's own prices, plus license prices only once seats are paid for — a
 * free plan whose seats are all included puts nothing on Stripe. */
const billsRecurringOnStripe = (customerProduct: FullCusProduct) => {
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	const ownPricesPaidRecurring =
		!isFreeProduct({ prices }) && !isOneOffProduct({ prices });
	return (
		ownPricesPaidRecurring || customerProductHasPaidLicenses(customerProduct)
	);
};

/** Plans that bill outside a Stripe subscription by design: a license seat bills
 * on its pool's subscription, and a reverting or no-card trial is Autumn's own. */
const isBilledWithoutSubscription = (customerProduct: FullCusProduct) =>
	notNullish(customerProduct.customer_license_link_id) ||
	isCustomerProductRevertingTrial(customerProduct) ||
	isCustomerProductAutumnManagedTrial(customerProduct);

const isLinkedToStripe = (customerProduct: FullCusProduct) =>
	Boolean(
		customerProduct.subscription_ids?.length ||
			customerProduct.scheduled_ids?.length,
	);

/**
 * Flags active paid recurring plans that no Stripe subscription or schedule
 * links to. Verify derives its subscriptions from these links, so without
 * this check such a plan is never billed and never reported.
 */
export const evaluatePlansWithoutSubscription = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): SubscriptionMismatch[] =>
	filterCustomerProductsByProcessorType({
		customerProducts: fullCustomer.customer_products,
		processorType: ProcessorType.Stripe,
	})
		.filter(
			(customerProduct) =>
				ACTIVE_STATUSES.includes(customerProduct.status) &&
				billsRecurringOnStripe(customerProduct) &&
				!isBilledWithoutSubscription(customerProduct) &&
				!isLinkedToStripe(customerProduct),
		)
		.map((customerProduct) => ({
			type: "missing_stripe_subscription",
			customer_product_id: customerProduct.id,
			plan_id: customerProduct.product.id,
			plan_name: customerProduct.product.name ?? undefined,
			entity_id: customerProduct.entity_id ?? undefined,
		}));
