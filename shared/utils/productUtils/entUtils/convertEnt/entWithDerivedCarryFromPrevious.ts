import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels.js";
import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature.js";

/**
 * An allocated feature's usage always carries across plan changes — the units
 * are held, not consumed. Rows written before that became the rule still hold
 * a literal `false`; re-derive on read so a stored row compares equal to a
 * desired row built from the same item.
 */
export const entWithDerivedCarryFromPrevious = (
	ent: EntitlementWithFeature,
): EntitlementWithFeature =>
	isAllocatedFeature(ent.feature) && !ent.carry_from_previous
		? { ...ent, carry_from_previous: true }
		: ent;
