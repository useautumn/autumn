/**
 * Parses business context (org_id, customer_id, entity_id) out of the
 * Redis key patterns used by the app.
 *
 * Supported patterns:
 *   - `{orgId}:env:customer:version:customerId`
 *   - `{orgId}:env:customer:version:customerId:entity:entityId`
 *   - `{orgId}:env:customer:version:customerId:balances:featureId[...]`
 *   - `{orgId}:env:customer_guard:customerId`
 *   - `{orgId}:env:test_cache_delete_guard:customerId`
 *   - `{orgId}:env:fullcustomer:version:customerId`
 *   - `{orgId}:env:fullcustomer:guard:customerId`
 *   - `{orgId}:env:fullcustomer:pathidx:customerId`
 *   - `{customerId}:orgId:env:full_subject[:...]` (FullSubject V2 — hash-tagged
 *     on customerId, orgId is the first unbraced segment; covers base,
 *     shared-balances, and view-epoch shapes)
 *   - `{customerId}:orgId:env:entity:entityId:full_subject` (FullSubject V2
 *     entity variant)
 *
 * Any parsing failure is swallowed — callers get `{}` back.
 */

export type RedisCacheGeneration = "v1" | "v2";

export type RedisKeyContext = {
	orgId?: string;
	customerId?: string;
	entityId?: string;
	/**
	 * Which cache shape this key belongs to. `v2` = FullSubject cache,
	 * `v1` = legacy per-customer / fullcustomer cache. Undefined when the
	 * key doesn't match any known shape.
	 */
	generation?: RedisCacheGeneration;
};

const stripHashTag = (segment: string): string => {
	if (segment.startsWith("{") && segment.endsWith("}")) {
		return segment.slice(1, -1);
	}
	return segment;
};

export const parseRedisKeyContext = ({
	key,
}: {
	key?: string;
}): RedisKeyContext => {
	if (!key) return {};

	try {
		const parts = key.split(":");
		if (parts.length < 3) return {};

		const first = parts[0];

		// FullSubject V2 keys — hash-tagged on customerId, orgId is the
		// first unbraced segment. Shapes:
		//   {customerId}:orgId:env:full_subject[:...]
		//   {customerId}:orgId:env:entity:entityId:full_subject
		if (
			first.startsWith("{") &&
			first.endsWith("}") &&
			parts.includes("full_subject")
		) {
			const customerId = stripHashTag(first);
			const orgId = parts[1];
			const entityId =
				parts[3] === "entity" && parts[4] && parts[5] === "full_subject"
					? parts[4]
					: undefined;
			return { customerId, orgId, entityId, generation: "v2" };
		}

		// {orgId}:env:<kind>:...
		if (first.startsWith("{") && first.endsWith("}")) {
			const orgId = stripHashTag(first);
			const kind = parts[2];

			if (kind === "fullcustomer") {
				// {orgId}:env:fullcustomer:(version|guard|pathidx):customerId
				const customerId = parts[4];
				return { orgId, customerId, generation: "v1" };
			}

			if (kind === "customer") {
				// {orgId}:env:customer:version:customerId[:entity:entityId][...]
				const customerId = parts[4];
				let entityId: string | undefined;
				const entityIdx = parts.indexOf("entity", 5);
				if (entityIdx !== -1 && parts[entityIdx + 1]) {
					entityId = parts[entityIdx + 1];
				}
				return { orgId, customerId, entityId, generation: "v1" };
			}

			if (kind === "customer_guard" || kind === "test_cache_delete_guard") {
				return { orgId, customerId: parts[3], generation: "v1" };
			}

			// Unknown kind, but orgId is still useful.
			return { orgId, generation: "v1" };
		}

		return {};
	} catch {
		return {};
	}
};
