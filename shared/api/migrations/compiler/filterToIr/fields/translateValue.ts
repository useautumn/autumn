import type { ResolutionContext } from "../resolutionContext.js";

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
