import type { LookupMaps } from "./buildLookupMaps.js";
import { toInt, toNullableTimestamp, toTimestamp } from "./normalizeFields.js";
import type { FlatCustomerProduct } from "./types.js";

export const hydrateCustomerProduct = (
	cp: FlatCustomerProduct,
	hydratedCes: unknown[],
	maps: LookupMaps,
) => {
	const customer_prices = maps.customerPricesByCpId.get(cp.id) ?? [];
	const free_trial = cp.free_trial_id
		? (maps.freeTrialById.get(cp.free_trial_id) ?? null)
		: null;

	return {
		...cp,
		created_at: toTimestamp(cp.created_at),
		starts_at: cp.starts_at
			? toTimestamp(cp.starts_at)
			: toTimestamp(cp.created_at),
		canceled_at: toNullableTimestamp(cp.canceled_at),
		ended_at: toNullableTimestamp(cp.ended_at),
		trial_ends_at: toNullableTimestamp(cp.trial_ends_at),
		quantity: toInt(cp.quantity, 1),
		options: cp.options ?? [],
		collection_method: cp.collection_method ?? "charge_automatically",
		subscription_ids: cp.subscription_ids ?? [],
		scheduled_ids: cp.scheduled_ids ?? [],
		customer_prices,
		customer_entitlements: hydratedCes,
		free_trial,
	};
};
