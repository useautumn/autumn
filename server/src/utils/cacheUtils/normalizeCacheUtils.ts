import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";

/**
 * Normalize data from Redis cache to fix Upstash cjson quirks.
 * Upstash Redis encodes/decodes JSON differently than local Redis:
 * - Empty objects {} may become empty arrays []
 * - null values may become undefined
 * - undefined values need to be converted to null for schemas
 */

/**
 * Helper function to normalize empty objects {} to empty arrays []
 * Lua's cjson converts empty arrays to empty objects, so we need to fix this
 */
export const normalizeArray = (value: unknown): unknown => {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).length === 0
	) {
		return [];
	}
	return value;
};

/**
 * Helper function to ensure metadata is an object, not an array
 */
const normalizeMetadata = (metadata: unknown): Record<string, any> => {
	// If metadata is an array (Upstash bug), convert to empty object
	if (Array.isArray(metadata)) {
		return {};
	}
	// If metadata is null/undefined, return empty object
	if (!metadata || typeof metadata !== "object") {
		return {};
	}
	return metadata as Record<string, any>;
};

/**
 * Normalize subscription fields (handle undefined -> null for nullable fields)
 */
const normalizeSubscription = (subscription: any): any => {
	if (!subscription) return subscription;

	// Normalize nullable timestamp fields
	subscription.canceled_at = subscription.canceled_at ?? null;
	subscription.expires_at = subscription.expires_at ?? null;
	subscription.trial_ends_at = subscription.trial_ends_at ?? null;
	subscription.current_period_start = subscription.current_period_start ?? null;
	subscription.current_period_end = subscription.current_period_end ?? null;

	// Normalize plan object (optional nested object)
	if (subscription.plan) {
		const plan = subscription.plan;

		// Normalize nullable plan fields
		plan.description = plan.description ?? null;
		plan.group = plan.group ?? null;
		plan.price = plan.price ?? null;
		plan.base_variant_id = plan.base_variant_id ?? null;
		plan.free_trial = plan.free_trial ?? null;

		// Ensure features is an array
		plan.features = normalizeArray(plan.features) ?? [];

		// Normalize each feature's nullable fields
		if (Array.isArray(plan.features)) {
			for (const feature of plan.features) {
				if (feature.price === undefined) {
					feature.price = null;
				}
			}
		}
	}

	return subscription;
};

/**
 * Normalize a single balance object from cache
 * Handles Lua cjson quirks for balance objects
 */
export const normalizeCachedBalance = (balance: any): any => {
	if (!balance) return balance;

	// Fix breakdown: empty object -> undefined
	if (
		!Array.isArray(balance.breakdown) &&
		typeof balance.breakdown === "object"
	) {
		balance.breakdown = undefined;
	}

	// Fix rollovers: empty object -> undefined
	if (
		!Array.isArray(balance.rollovers) &&
		typeof balance.rollovers === "object"
	) {
		balance.rollovers = undefined;
	}

	// Fix nullable numeric fields (undefined -> null)
	if (balance.max_purchase === undefined) {
		balance.max_purchase = null;
	}

	// Fix reset field (null/falsy -> undefined for optional fields)
	if (!balance.reset || balance.reset === null) {
		balance.reset = undefined;
	}

	// Fix breakdown
	if (balance.breakdown) {
		for (const breakdown of balance.breakdown) {
			// Fix nullable fields in breakdown
			if (breakdown.max_purchase === undefined) {
				breakdown.max_purchase = null;
			}

			// Fix reset field
			if (!breakdown.reset) {
				breakdown.reset = null;
			}
		}
	}

	// Fix event_names: empty object -> empty array
	if (balance.feature?.event_names) {
		balance.feature.event_names = normalizeArray(
			balance.feature.event_names,
		) as typeof balance.feature.event_names;
	}

	return balance;
};

/**
 * Fix Lua cjson quirks when parsing cached data:
 * - Converts empty objects {} back to [] for all array fields
 * - Converts undefined to null for nullable fields
 * - Fixes metadata array -> object conversion
 */
export const normalizeCachedData = <T extends ApiCustomer | ApiEntityV1>(
	data: T,
): T => {
	// Fix metadata (Upstash may return as array instead of object)

	(data as any).id = (data as any).id ?? null;
	(data as any).name = (data as any).name ?? null;
	(data as any).email = (data as any).email ?? null;
	(data as any).fingerprint = (data as any).fingerprint ?? null;
	(data as any).stripe_id = (data as any).stripe_id ?? null;
	(data as any).metadata = normalizeMetadata((data as any).metadata);

	// Normalize subscriptions array
	if (data.subscriptions) {
		// Fix empty object -> empty array
		if (!Array.isArray(data.subscriptions)) {
			data.subscriptions = [];
		}

		// Normalize each subscription's nullable fields
		for (let i = 0; i < data.subscriptions.length; i++) {
			data.subscriptions[i] = normalizeSubscription(data.subscriptions[i]);
		}
	}

	// Normalize entities array (for ApiCustomer only)
	if ("entities" in data && data.entities) {
		data.entities = normalizeArray(data.entities) as typeof data.entities;
	}

	// Normalize balances
	if (data.balances) {
		for (const featureId in data.balances) {
			const balance = data.balances[featureId];

			// Normalize the balance (handles reset, max_purchase, event_names, etc.)
			data.balances[featureId] = normalizeCachedBalance(balance);
		}
	}

	return data;
};
