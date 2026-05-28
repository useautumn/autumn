import {
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import {
	carryIdentityToKey,
	customerEntitlementToCarryIdentity,
} from "./carryIdentity";
import { customerProductWithOnlyEntitlements } from "./projectCustomerProductForCarry";

export type CustomerProductCarryGroup = {
	fromCustomerProduct: FullCusProduct;
	toCustomerProduct: FullCusProduct;
};

const addToGroup = <T>(groups: Map<string, T[]>, key: string, value: T) => {
	const group = groups.get(key);
	if (group) {
		group.push(value);
		return;
	}

	groups.set(key, [value]);
};

const groupCustomerEntitlementsByCarryIdentity = ({
	customerProduct,
	customerEntitlements,
}: {
	customerProduct: FullCusProduct;
	customerEntitlements: FullCustomerEntitlement[];
}) => {
	const customerEntitlementsByKey = new Map<
		string,
		FullCustomerEntitlement[]
	>();

	for (const customerEntitlement of customerEntitlements) {
		const key = carryIdentityToKey(
			customerEntitlementToCarryIdentity({
				customerEntitlement,
				customerProduct,
			}),
		);
		addToGroup(customerEntitlementsByKey, key, customerEntitlement);
	}

	return customerEntitlementsByKey;
};

export const getCustomerProductCarryGroups = ({
	fromCustomerProduct,
	toCustomerProduct,
	fromCustomerEntitlements,
}: {
	fromCustomerProduct: FullCusProduct;
	toCustomerProduct: FullCusProduct;
	fromCustomerEntitlements: FullCustomerEntitlement[];
}): CustomerProductCarryGroup[] => {
	const toEntitlementsByKey = groupCustomerEntitlementsByCarryIdentity({
		customerProduct: toCustomerProduct,
		customerEntitlements: toCustomerProduct.customer_entitlements,
	});
	const fromEntitlementsByKey = groupCustomerEntitlementsByCarryIdentity({
		customerProduct: fromCustomerProduct,
		customerEntitlements: fromCustomerEntitlements,
	});

	return Array.from(fromEntitlementsByKey.entries()).flatMap(
		([key, fromEntitlements]) => {
			const toEntitlements = toEntitlementsByKey.get(key);
			if (!toEntitlements) return [];

			return {
				fromCustomerProduct: customerProductWithOnlyEntitlements({
					customerProduct: fromCustomerProduct,
					customerEntitlements: fromEntitlements,
				}),
				toCustomerProduct: customerProductWithOnlyEntitlements({
					customerProduct: toCustomerProduct,
					customerEntitlements: toEntitlements,
				}),
			};
		},
	);
};
