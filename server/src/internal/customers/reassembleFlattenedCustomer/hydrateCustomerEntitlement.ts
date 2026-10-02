import type { LookupMaps } from "./buildLookupMaps.js";
import { toFloat, toNullableTimestamp, toTimestamp } from "./normalizeFields.js";
import type { FlatCustomerEntitlement } from "./types.js";

export const hydrateCustomerEntitlement = (
	ce: FlatCustomerEntitlement,
	maps: LookupMaps,
	{ normalize }: { normalize: boolean },
) => {
	const entitlement = maps.entitlementById.get(ce.entitlement_id) ?? null;
	const replaceables = maps.replaceablesByCeId.get(ce.id) ?? [];
	const rollovers = maps.rolloversByCeId.get(ce.id) ?? [];

	const base = normalize
		? {
				...ce,
				created_at: toTimestamp(ce.created_at),
				next_reset_at: toNullableTimestamp(ce.next_reset_at),
				balance: toFloat(ce.balance),
				adjustment: toFloat(ce.adjustment),
			}
		: ce;

	return {
		...base,
		entitlement: entitlement
			? { ...entitlement, feature: (entitlement as any).feature ?? null }
			: null,
		replaceables,
		rollovers,
	};
};
