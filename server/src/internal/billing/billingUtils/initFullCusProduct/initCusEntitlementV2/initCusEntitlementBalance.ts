import {
	type EntitlementWithFeature,
	type EntityBalance,
	entToOptions,
	entToPrice,
	getStartingBalance,
	type InitFullCusProductContext,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { initCusEntitlementEntities } from "./initCusEntitlementEntities";

export interface InitCusEntitlementBalanceResult {
	balance: number;
	entities: Record<string, EntityBalance> | null;
}

export const initCusEntitlementBalance = ({
	initContext,
	entitlement,
}: {
	initContext: InitFullCusProductContext;
	entitlement: EntitlementWithFeature;
}): { balance: number; entities: Record<string, EntityBalance> | null } => {
	// 1. If entitlement is boolean or unlimited, return 0
	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });

	if (isBoolean || isUnlimited) {
		return { balance: 0, entities: null };
	}

	// 2. Get starting balance
	const { fullCus, featureQuantities, replaceables } = initContext;

	const price = entToPrice({
		ent: entitlement,
		prices: initContext.product.prices,
	});

	const options = entToOptions({
		ent: entitlement,
		options: featureQuantities,
	});

	let startingBalance = getStartingBalance({
		entitlement,
		options,
		relatedPrice: price,
	});

	// 3. Get entitlement entities if entity scoped
	const entities = initCusEntitlementEntities({
		entitlement,
		customerEntities: fullCus.entities,
		startingBalance,
	});

	// Subtract replaceables from starting balance
	const entReplaceables = replaceables.filter(
		(r) => r.ent.id === entitlement.id,
	);
	startingBalance = new Decimal(startingBalance)
		.sub(entReplaceables.length)
		.toNumber();

	return { balance: startingBalance, entities };
};
