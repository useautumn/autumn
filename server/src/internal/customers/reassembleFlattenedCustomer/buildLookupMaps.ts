import type {
	FlatCustomerPrice,
	FlatEntitlement,
	FlatFreeTrial,
	FlatReplaceable,
	FlatRollover,
	FlatSubscription,
} from "./types.js";

export type LookupMaps = {
	entitlementById: Map<string, FlatEntitlement>;
	freeTrialById: Map<string, FlatFreeTrial>;
	subscriptionByStripeId: Map<string, FlatSubscription>;
	rolloversByCeId: Map<string, FlatRollover[]>;
	replaceablesByCeId: Map<string, FlatReplaceable[]>;
	customerPricesByCpId: Map<string, FlatCustomerPrice[]>;
};

const groupBy = <T, K>(items: T[], keyOf: (x: T) => K): Map<K, T[]> => {
	const out = new Map<K, T[]>();
	for (const item of items) {
		const k = keyOf(item);
		const existing = out.get(k);
		if (existing) existing.push(item);
		else out.set(k, [item]);
	}
	return out;
};

const indexBy = <T, K>(items: T[], keyOf: (x: T) => K): Map<K, T> => {
	const out = new Map<K, T>();
	for (const item of items) out.set(keyOf(item), item);
	return out;
};

export const buildLookupMaps = (flat: {
	entitlements: FlatEntitlement[];
	free_trials: FlatFreeTrial[];
	subscriptions: FlatSubscription[];
	rollovers: FlatRollover[];
	replaceables: FlatReplaceable[];
	customer_prices: FlatCustomerPrice[];
}): LookupMaps => ({
	entitlementById: indexBy(flat.entitlements, (e) => e.id),
	freeTrialById: indexBy(flat.free_trials, (ft) => ft.id),
	subscriptionByStripeId: indexBy(flat.subscriptions, (s) => s.stripe_id),
	rolloversByCeId: groupBy(flat.rollovers, (r) => r.cus_ent_id),
	replaceablesByCeId: groupBy(flat.replaceables, (r) => r.cus_ent_id),
	customerPricesByCpId: groupBy(
		flat.customer_prices,
		(cp) => cp.customer_product_id,
	),
});
