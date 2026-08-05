import type { FullCustomerEntitlement, FullSubject } from "@autumn/shared";
import type { SyncEntry } from "./flushSubjectBalancesToDb.js";

/** SQS caps a message at 256KB; the rest of a sync payload is a few hundred
 *  bytes, so this leaves ample headroom while dropping pathological snapshots
 *  (entity maps with thousands of keys) back to the pre-existing behaviour. */
const MAX_SNAPSHOT_JSON_CHARS = 96_000;

const indexCustomerEntitlements = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): Map<string, FullCustomerEntitlement> => {
	const byId = new Map<string, FullCustomerEntitlement>();
	for (const customerProduct of fullSubject.customer_products) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			byId.set(customerEntitlement.id, customerEntitlement);
		}
	}
	for (const customerEntitlement of fullSubject.extra_customer_entitlements ??
		[]) {
		byId.set(customerEntitlement.id, customerEntitlement);
	}
	return byId;
};

/**
 * Post-deduction balance snapshots taken straight from the mutated FullSubject,
 * shaped exactly like the entries `syncItemV4` rebuilds from the balance cache.
 *
 * They ride the sync payload so an invalidation landing between a deduction and
 * its async sync — a Stripe webhook, an attach's cache refresh — can no longer
 * erase the deduction. Without them the sync's cache read misses and the whole
 * balance write is dropped, so the usage silently reverts to its pre-track
 * Postgres value. `sync_balances_v2`'s RESET_AT / ENTITY_COUNT / CACHE_VERSION
 * guards still reject any snapshot Postgres has legitimately moved past, so the
 * fallback can only ever restore a deduction, never resurrect a stale one.
 */
export const buildBalanceSnapshotEntries = ({
	fullSubject,
	modifiedCusEntIdsByFeatureId,
}: {
	fullSubject: FullSubject;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
}): SyncEntry[] => {
	const customerEntitlementsById = indexCustomerEntitlements({ fullSubject });

	const entries: SyncEntry[] = [];
	for (const [featureId, customerEntitlementIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		for (const customerEntitlementId of customerEntitlementIds) {
			const customerEntitlement = customerEntitlementsById.get(
				customerEntitlementId,
			);
			if (!customerEntitlement) continue;

			const entities = customerEntitlement.entities ?? null;
			entries.push({
				customer_entitlement_id: customerEntitlement.id,
				feature_id: featureId,
				balance: customerEntitlement.balance ?? 0,
				adjustment: customerEntitlement.adjustment ?? 0,
				entities,
				next_reset_at: customerEntitlement.next_reset_at ?? null,
				entity_count: entities ? Object.keys(entities).length : 0,
				cache_version: customerEntitlement.cache_version ?? 0,
			});
		}
	}

	if (entries.length === 0) return [];
	if (JSON.stringify(entries).length > MAX_SNAPSHOT_JSON_CHARS) return [];

	return entries;
};
