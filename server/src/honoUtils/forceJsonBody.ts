import type { Context } from "hono";

/**
 * Force a field onto the request's JSON body so every downstream reader
 * (validators, handlers) observes the forced value.
 *
 * This is the ONE place coupled to Hono's body cache: `c.req.json()` resolves
 * `bodyCache.text` and JSON.parses it, so we reset the cache to the forced
 * text. Covered by forceJsonBody.test.ts — if a Hono upgrade changes the cache
 * shape, that test fails loudly here instead of silently unscoping requests.
 */
export const forceJsonBodyField = async (
	c: Context,
	field: string,
	value: unknown,
) => {
	const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
	const forced = JSON.stringify({ ...body, [field]: value });
	// Replace the whole cache, not just `.text`: drops any parsed/json
	// representation so every downstream reader re-derives from the forced body.
	(c.req as { bodyCache: Record<string, unknown> }).bodyCache = {
		text: Promise.resolve(forced),
	};
};
