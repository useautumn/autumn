import type { LintRule } from "../runtime/lintDocument";
import { featureRules } from "./features";
import { planItemRules } from "./plans";

/**
 * Hand-written rules and names, keyed by fixture path with array indices
 * elided — the same convention as the casing hints. Everything the spec can
 * say is harvested separately and merged in at generate time.
 */
export type RegistryEntry = {
	/** How one entry is named in an error; the key name when absent. */
	label?: string;
	/** Field whose value names one entry. */
	idField?: string;
	rules?: LintRule[];
};

export const LINT_REGISTRY: Record<string, RegistryEntry> = {
	features: { label: "feature", idField: "featureId", rules: featureRules },
	plans: { label: "plan", idField: "planId" },
	"plans.items": { label: "item", idField: "featureId", rules: planItemRules },
	"plans.licenses": { label: "license", idField: "licensePlanId" },
};
