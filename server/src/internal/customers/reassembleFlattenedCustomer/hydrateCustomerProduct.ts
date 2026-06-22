import type { LookupMaps } from "./buildLookupMaps.js";
import { normalizeCustomerProductTimeFields } from "./normalizeFields.js";
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
		...normalizeCustomerProductTimeFields({ ...cp }),
		options: cp.options ?? [],
		collection_method: cp.collection_method ?? "charge_automatically",
		subscription_ids: cp.subscription_ids ?? [],
		scheduled_ids: cp.scheduled_ids ?? [],
		customer_prices,
		customer_entitlements: hydratedCes,
		free_trial,
	};
};
