import {
	type Entitlement,
	featureUtils,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	type InsertCustomerEntitlement,
	isBooleanCusEnt,
	isOneOffPrice,
	isPrepaidPrice,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { createHash } from "node:crypto";
import {
	initCarryOverCustomerEntitlement,
	initCarryOverEntitlement,
} from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";

const ONE_OFF_PREPAID_CARRYOVER_PREFIX = "one_off_prepaid_carryover_";

const oneOffPrepaidCarryoverExternalId = (originatingCusEntId: string): string =>
	`${ONE_OFF_PREPAID_CARRYOVER_PREFIX}${createHash("sha256")
		.update(originatingCusEntId)
		.digest("hex")
		.slice(0, 10)}`;

export const oneOffPrepaidCusEntsByFeatureId = (
	cusProduct: FullCusProduct,
): Map<string, FullCustomerEntitlement> => {
	const oneOffPrepaidEntitlementIds = new Set(
		(cusProduct.customer_prices ?? [])
			.filter((cusPrice) => {
				const price = cusPrice.price;
				return isOneOffPrice(price) && isPrepaidPrice(price);
			})
			.map((cusPrice) => cusPrice.price.entitlement_id)
			.filter((entitlementId): entitlementId is string => Boolean(entitlementId)),
	);

	const result = new Map<string, FullCustomerEntitlement>();
	if (oneOffPrepaidEntitlementIds.size === 0) return result;

	for (const cusEnt of cusProduct.customer_entitlements) {
		if (isBooleanCusEnt({ cusEnt })) continue;
		if (isUnlimitedCusEnt(cusEnt)) continue;
		if (!oneOffPrepaidEntitlementIds.has(cusEnt.entitlement.id)) continue;
		if (featureUtils.isAllocated(cusEnt.entitlement.feature)) continue;

		const featureId = cusEnt.entitlement.feature?.id;
		if (!featureId) continue;

		result.set(featureId, cusEnt);
	}

	return result;
};

const buildLifetimeCarryOver = ({
	cusEnt,
	balance,
	fullCustomer,
	currentCustomerProduct,
}: {
	cusEnt: FullCustomerEntitlement;
	balance: number;
	fullCustomer: FullCustomer;
	currentCustomerProduct: FullCusProduct;
}): {
	entitlement: Entitlement;
	customerEntitlement: InsertCustomerEntitlement;
} => {
	const entitlement = initCarryOverEntitlement({
		cusEnt,
		orgId: fullCustomer.org_id,
		allowance: balance,
	});
	const customerEntitlement: InsertCustomerEntitlement = {
		...initCarryOverCustomerEntitlement({
			cusEnt,
			entitlementId: entitlement.id,
			internalCustomerId: fullCustomer.internal_id,
			customerId: fullCustomer.id,
			internalEntityId: currentCustomerProduct.internal_entity_id ?? null,
			balance,
			expiresAt: null,
		}),
		external_id: oneOffPrepaidCarryoverExternalId(cusEnt.id),
	};
	return { entitlement, customerEntitlement };
};

export const cusProductToOneOffPrepaidCarryOvers = ({
	currentCustomerProduct,
	fullCustomer,
}: {
	currentCustomerProduct: FullCusProduct | null | undefined;
	fullCustomer: FullCustomer;
}): {
	entitlements: Entitlement[];
	customerEntitlements: InsertCustomerEntitlement[];
} => {
	const entitlements: Entitlement[] = [];
	const customerEntitlements: InsertCustomerEntitlement[] = [];

	if (!currentCustomerProduct) return { entitlements, customerEntitlements };

	for (const cusEnt of oneOffPrepaidCusEntsByFeatureId(
		currentCustomerProduct,
	).values()) {
		const balance = cusEnt.balance ?? 0;
		if (balance <= 0) continue;

		const { entitlement, customerEntitlement } = buildLifetimeCarryOver({
			cusEnt,
			balance,
			fullCustomer,
			currentCustomerProduct,
		});
		entitlements.push(entitlement);
		customerEntitlements.push(customerEntitlement);
	}

	return { entitlements, customerEntitlements };
};

export const cusProductsToOneOffPrepaidCarryOvers = ({
	currentCustomerProducts,
	fullCustomer,
}: {
	currentCustomerProducts: FullCusProduct[];
	fullCustomer: FullCustomer;
}): {
	entitlements: Entitlement[];
	customerEntitlements: InsertCustomerEntitlement[];
} => {
	const entitlements: Entitlement[] = [];
	const customerEntitlements: InsertCustomerEntitlement[] = [];

	for (const currentCustomerProduct of currentCustomerProducts) {
		const next = cusProductToOneOffPrepaidCarryOvers({
			currentCustomerProduct,
			fullCustomer,
		});
		entitlements.push(...next.entitlements);
		customerEntitlements.push(...next.customerEntitlements);
	}

	return { entitlements, customerEntitlements };
};

