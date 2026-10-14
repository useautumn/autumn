import {
	type ApiCusProcessors,
	type Customer,
	customerProductHasActiveStatus,
	type FullCusProduct,
	filterCustomerProductsByProcessorType,
	ProcessorType,
} from "@autumn/shared";

export const getCusProcessors = ({
	customer,
	customer_products,
}: {
	customer: Customer;
	customer_products: FullCusProduct[];
}): ApiCusProcessors | undefined => {
	const stripe = customer.processor?.id
		? { id: customer.processor.id }
		: undefined;

	const vercelDb = customer.processors?.vercel;
	const vercel = vercelDb
		? {
				installation_id: vercelDb.installation_id,
				account_id: vercelDb.account_id,
			}
		: undefined;

	const rcProducts = filterCustomerProductsByProcessorType({
		customerProducts: customer_products,
		processorType: ProcessorType.RevenueCat,
	}).filter(customerProductHasActiveStatus);
	const revenuecat =
		rcProducts.length > 0
			? { id: customer.processors?.revenuecat?.id ?? customer.id ?? null }
			: undefined;

	if (!stripe && !vercel && !revenuecat) return undefined;

	return { stripe, vercel, revenuecat };
};
