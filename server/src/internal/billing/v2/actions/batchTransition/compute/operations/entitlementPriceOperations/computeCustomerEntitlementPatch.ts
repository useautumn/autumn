import {
	type EntitlementWithFeature,
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

const computeBalancePatch = ({
	fromInitialState,
	toInitialState,
}: {
	fromInitialState: CustomerEntitlementInitialState;
	toInitialState: CustomerEntitlementInitialState;
}): CustomerEntitlementBalancePatch | undefined => {
	if (fromInitialState.tracksBalance && toInitialState.tracksBalance) {
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
}: {
	fromEntitlement: EntitlementWithFeature;
	toEntitlement: EntitlementWithFeature;
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
	const balance = computeBalancePatch({ fromInitialState, toInitialState });

	if (balance) patch.balance = balance;
	if (fromInitialState.unlimited !== toInitialState.unlimited) {
		patch.unlimited = toInitialState.unlimited;
	}

	return patch;
};
