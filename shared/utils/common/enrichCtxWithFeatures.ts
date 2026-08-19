import type { Feature } from "@models/featureModels/featureModels.js";

/** Returns a ctx copy whose `features` are the projected working set. */
export const enrichCtxWithFeatures = <C extends { features: Feature[] }>({
	ctx,
	features,
}: {
	ctx: C;
	features: Feature[];
}): C => ({
	...ctx,
	features,
});
