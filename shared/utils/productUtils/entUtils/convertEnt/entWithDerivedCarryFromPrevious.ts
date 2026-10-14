import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels.js";
import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature.js";

export const entWithDerivedCarryFromPrevious = (
	ent: EntitlementWithFeature,
): EntitlementWithFeature =>
	isAllocatedFeature(ent.feature) && !ent.carry_from_previous
		? { ...ent, carry_from_previous: true }
		: ent;
