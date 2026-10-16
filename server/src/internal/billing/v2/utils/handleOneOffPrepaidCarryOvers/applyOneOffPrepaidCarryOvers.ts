import type {
	Entitlement,
	FullCusProduct,
	FullCustomer,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	cusProductsToOneOffPrepaidCarryOvers,
	oneOffPrepaidCusEntsByFeatureId,
} from "./cusProductToOneOffPrepaidCarryOvers";

/**
 * billing.update variant: merges preserved balance into the new cusProduct's
 * matching one-off slot when one exists; lifetime fallback otherwise.
 * MUTATES `newCustomerProduct.customer_entitlements` in place.
 */
export const applyOneOffPrepaidCarryOvers = ({
	oldCustomerProduct,
	newCustomerProduct,
	fullCustomer,
}: {
	oldCustomerProduct: FullCusProduct;
	newCustomerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): {
	entitlements: Entitlement[];
	customerEntitlements: InsertCustomerEntitlement[];
} => {
	const lifetimeCarryOvers = cusProductsToOneOffPrepaidCarryOvers({
		currentCustomerProducts: [oldCustomerProduct],
		fullCustomer,
	});

	const newSlotByFeatureId = oneOffPrepaidCusEntsByFeatureId(newCustomerProduct);

	const mergedEntitlementIds = new Set<string>();
	const remainingCustomerEntitlements: InsertCustomerEntitlement[] = [];

	for (const carryOverRow of lifetimeCarryOvers.customerEntitlements) {
		const featureId = carryOverRow.feature_id;
		const newSlot = featureId ? newSlotByFeatureId.get(featureId) : undefined;

		if (!newSlot) {
			remainingCustomerEntitlements.push(carryOverRow);
			continue;
		}

		const addedBalance = carryOverRow.balance ?? 0;
		// Bump `adjustment` in lockstep with `balance` — grantedBalance picks
		// up the preserved amount so usage stays at 0 instead of going negative.
		newSlot.balance = new Decimal(newSlot.balance ?? 0)
			.add(addedBalance)
			.toNumber();
		newSlot.adjustment = new Decimal(newSlot.adjustment ?? 0)
			.add(addedBalance)
			.toNumber();
		newSlot.external_id ??= carryOverRow.external_id ?? null;

		mergedEntitlementIds.add(carryOverRow.entitlement_id);
	}

	const remainingEntitlements = lifetimeCarryOvers.entitlements.filter(
		(entitlement) => !mergedEntitlementIds.has(entitlement.id),
	);

	return {
		entitlements: remainingEntitlements,
		customerEntitlements: remainingCustomerEntitlements,
	};
};
