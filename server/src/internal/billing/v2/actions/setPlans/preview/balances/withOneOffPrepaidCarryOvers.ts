import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	findCustomerProductById,
} from "@autumn/shared";
import { cusProductsToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";

const expiringCustomerProducts = ({
	previousCustomer,
	phaseCustomer,
}: {
	previousCustomer: FullCustomer;
	phaseCustomer: FullCustomer;
}) =>
	previousCustomer.customer_products.filter(
		(customerProduct) =>
			customerProductHasActiveStatus(customerProduct) &&
			findCustomerProductById({
				fullCustomer: phaseCustomer,
				customerProductId: customerProduct.id,
			})?.status === CusProductStatus.Expired,
	);

/** The loose lifetime rows billing and phase activation insert for expiring one-off prepaid balances. */
const oneOffPrepaidCarryOvers = ({
	fullCustomer,
	customerProducts,
}: {
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
}): FullCustomerEntitlement[] => {
	const { entitlements, customerEntitlements } =
		cusProductsToOneOffPrepaidCarryOvers({
			currentCustomerProducts: customerProducts,
			fullCustomer,
		});
	const sourceFeatures = customerProducts
		.flatMap((customerProduct) => customerProduct.customer_entitlements)
		.map((customerEntitlement) => customerEntitlement.entitlement.feature);

	return customerEntitlements.flatMap((customerEntitlement) => {
		const entitlement = entitlements.find(
			(candidate) => candidate.id === customerEntitlement.entitlement_id,
		);
		const feature = sourceFeatures.find(
			(candidate) =>
				candidate.internal_id === customerEntitlement.internal_feature_id,
		);
		if (!entitlement || !feature) return [];

		return [
			{
				...customerEntitlement,
				entitlement: { ...entitlement, feature },
				replaceables: [],
				rollovers: [],
			} as FullCustomerEntitlement,
		];
	});
};

/** Phase customers with the one-off prepaid balances that outlive each expiring plan, as billing and activation keep them. */
export const withOneOffPrepaidCarryOvers = ({
	originalFullCustomer,
	phaseCustomers,
}: {
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
}): FullCustomer[] => {
	const carriedEntitlements: FullCustomerEntitlement[] = [];

	return phaseCustomers.map((phaseCustomer, phaseIndex) => {
		const previousCustomer =
			phaseIndex === 0 ? originalFullCustomer : phaseCustomers[phaseIndex - 1];
		carriedEntitlements.push(
			...oneOffPrepaidCarryOvers({
				fullCustomer: previousCustomer,
				customerProducts: expiringCustomerProducts({
					previousCustomer,
					phaseCustomer,
				}),
			}),
		);

		return {
			...phaseCustomer,
			extra_customer_entitlements: [
				...(phaseCustomer.extra_customer_entitlements ?? []),
				...carriedEntitlements,
			],
		};
	});
};
