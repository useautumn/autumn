import type { ResolutionContext } from "./resolutionContext.js";

/**
 * Translate a public ID (or array of public IDs) to internal IDs for the
 * fields that need it: `feature_id`. All other fields pass through
 * unchanged. Unknown IDs throw.
 *
 * Note: `plan_id` is NOT translated. A public plan_id (e.g. "pro") maps
 * to many `internal_product_id`s — one per plan version — so we resolve
 * it via a JOIN to `products` instead, filtering on `products.id`.
 */
export function translateValue({
	field,
	value,
	ctx,
}: {
	field: string;
	value: unknown;
	ctx: ResolutionContext;
}): unknown {
	const lookup = TRANSLATORS[field];
	if (!lookup) return value;
	if (value === null) return value;
	if (Array.isArray(value)) return value.map((v) => lookup(v, ctx));
	return lookup(value, ctx);
}

const TRANSLATORS: Record<
	string,
	(value: unknown, ctx: ResolutionContext) => unknown
> = {
	feature_id: (value, ctx) => {
		if (typeof value !== "string")
			throw new Error(`feature_id must be a string, got ${typeof value}`);
		const feature = ctx.features.find((f) => f.id === value);
		if (!feature) throw new Error(`Unknown feature_id: ${value}`);
		return feature.internal_id;
	},
};
