import {
	type CarryOverUsages,
	type EntitlementWithFeature,
	featureUtils,
	getStartingBalance,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type {
	CustomerEntitlementBalancePatch,
	CustomerEntitlementPatch,
} from "../../../types/entitlementPriceOperationTypes";

type CustomerEntitlementInitialState = {
	granted: number;
	tracksBalance: boolean;
	unlimited: boolean | null;
};

export const computeCustomerEntitlementInitialState = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): CustomerEntitlementInitialState => {
	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });
	const tracksBalance = !isBoolean && !isUnlimited;

	return {
		granted: tracksBalance ? getStartingBalance({ entitlement }) : 0,
		tracksBalance,
		unlimited: isBoolean ? null : isUnlimited,
	};
};

/** Mirrors attach: allocated usage always carries, `carry_from_previous`
 * carries its own entitlement, and the param carries listed consumables. */
export const shouldCarryOverUsage = ({
	toEntitlement,
	carryOverUsages,
}: {
	toEntitlement: EntitlementWithFeature;
	carryOverUsages: CarryOverUsages;
}): boolean => {
	if (featureUtils.isAllocated(toEntitlement.feature)) return true;
	if (toEntitlement.carry_from_previous) return true;
	if (!carryOverUsages?.enabled) return false;
	if (!carryOverUsages.feature_ids) return true;
	return carryOverUsages.feature_ids.includes(toEntitlement.feature.id);
};

const computeBalancePatch = ({
	fromInitialState,
	toInitialState,
	carryUsage,
}: {
	fromInitialState: CustomerEntitlementInitialState;
	toInitialState: CustomerEntitlementInitialState;
	carryUsage: boolean;
}): CustomerEntitlementBalancePatch | undefined => {
	if (fromInitialState.tracksBalance && toInitialState.tracksBalance) {
		if (!carryUsage) {
			return { type: "set", amount: toInitialState.granted };
		}
		const amount = new Decimal(toInitialState.granted).sub(
			fromInitialState.granted,
		);
		return amount.isZero()
			? undefined
			: { type: "increment", amount: amount.toNumber() };
	}

	if (fromInitialState.tracksBalance === toInitialState.tracksBalance) {
		return undefined;
	}
	return { type: "set", amount: toInitialState.granted };
};

export const computeCustomerEntitlementPatch = ({
	fromEntitlement,
	toEntitlement,
	carryOverUsages,
}: {
	fromEntitlement: EntitlementWithFeature;
	toEntitlement: EntitlementWithFeature;
	carryOverUsages?: CarryOverUsages;
}): CustomerEntitlementPatch => {
	if (
		isBooleanEntitlement({ entitlement: fromEntitlement }) ||
		isBooleanEntitlement({ entitlement: toEntitlement })
	) {
		return {};
	}

	const fromInitialState = computeCustomerEntitlementInitialState({
		entitlement: fromEntitlement,
	});
	const toInitialState = computeCustomerEntitlementInitialState({
		entitlement: toEntitlement,
	});
	const patch: CustomerEntitlementPatch = {};
	const balance = computeBalancePatch({
		fromInitialState,
		toInitialState,
		carryUsage: shouldCarryOverUsage({ toEntitlement, carryOverUsages }),
	});

	if (balance) patch.balance = balance;
	if (fromInitialState.unlimited !== toInitialState.unlimited) {
		patch.unlimited = toInitialState.unlimited;
	}

	return patch;
};
