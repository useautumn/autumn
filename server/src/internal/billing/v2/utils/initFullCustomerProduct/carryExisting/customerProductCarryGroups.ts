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

/** Resolved replacement pair used when an updated item no longer identity-matches its source. */
export type CustomerProductCarryLink = {
	fromCustomerEntitlement: FullCustomerEntitlement;
	toCustomerEntitlement: FullCustomerEntitlement;
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

const getLinkedCustomerProductCarryGroups = ({
	fromCustomerProduct,
	toCustomerProduct,
	links,
}: {
	fromCustomerProduct: FullCusProduct;
	toCustomerProduct: FullCusProduct;
	links: CustomerProductCarryLink[];
}): CustomerProductCarryGroup[] =>
	links.map((link) => ({
		fromCustomerProduct: customerProductWithOnlyEntitlements({
			customerProduct: fromCustomerProduct,
			customerEntitlements: [link.fromCustomerEntitlement],
		}),
		toCustomerProduct: customerProductWithOnlyEntitlements({
			customerProduct: toCustomerProduct,
			customerEntitlements: [link.toCustomerEntitlement],
		}),
	}));

const getIdentityCustomerProductCarryGroups = ({
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

const getUnlinkedCustomerEntitlements = ({
	customerEntitlements,
	linkedCustomerEntitlementIds,
}: {
	customerEntitlements: FullCustomerEntitlement[];
	linkedCustomerEntitlementIds: Set<string>;
}) => {
	const unlinkedCustomerEntitlements: FullCustomerEntitlement[] = [];

	for (const customerEntitlement of customerEntitlements) {
		if (linkedCustomerEntitlementIds.has(customerEntitlement.id)) continue;
		unlinkedCustomerEntitlements.push(customerEntitlement);
	}

	return unlinkedCustomerEntitlements;
};

export const getCustomerProductCarryGroups = ({
	fromCustomerProduct,
	toCustomerProduct,
	fromCustomerEntitlements,
	links,
}: {
	fromCustomerProduct: FullCusProduct;
	toCustomerProduct: FullCusProduct;
	fromCustomerEntitlements: FullCustomerEntitlement[];
	links?: CustomerProductCarryLink[];
}): CustomerProductCarryGroup[] => {
	const linkedFromCustomerEntitlementIds = new Set(
		links?.map((link) => link.fromCustomerEntitlement.id),
	);
	const linkedToCustomerEntitlementIds = new Set(
		links?.map((link) => link.toCustomerEntitlement.id),
	);
	const linkedCarryGroups = getLinkedCustomerProductCarryGroups({
		fromCustomerProduct,
		toCustomerProduct,
		links: links ?? [],
	});
	const identityCarryGroups = getIdentityCustomerProductCarryGroups({
		fromCustomerProduct,
		toCustomerProduct: {
			...toCustomerProduct,
			customer_entitlements: getUnlinkedCustomerEntitlements({
				customerEntitlements: toCustomerProduct.customer_entitlements,
				linkedCustomerEntitlementIds: linkedToCustomerEntitlementIds,
			}),
		},
		fromCustomerEntitlements: getUnlinkedCustomerEntitlements({
			customerEntitlements: fromCustomerEntitlements,
			linkedCustomerEntitlementIds: linkedFromCustomerEntitlementIds,
		}),
	});

	return [...linkedCarryGroups, ...identityCarryGroups];
};
