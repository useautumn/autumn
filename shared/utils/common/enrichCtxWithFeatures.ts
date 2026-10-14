import type { Feature } from "@models/featureModels/featureModels.js";

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
