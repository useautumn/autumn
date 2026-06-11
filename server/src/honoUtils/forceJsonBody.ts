import type { Context } from "hono";

/**
 * Force a field onto the request's JSON body so every downstream reader
 * (validators, handlers) observes the forced value.
 *
 * This is the ONE place coupled to Hono's body cache: `c.req.json()` resolves
 * `bodyCache.text` (a `Promise<string>`) and JSON.parses it, so we overwrite
 * that. Covered by forceJsonBody.test.ts — if a Hono upgrade changes the cache
 * shape, that test fails loudly here instead of silently unscoping requests.
 */
export const forceJsonBodyField = async (
	c: Context,
	field: string,
	value: unknown,
) => {
	const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
	const forced = JSON.stringify({ ...body, [field]: value });
	(c.req.bodyCache as { text?: Promise<string> }).text =
		Promise.resolve(forced);
};
