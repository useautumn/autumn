import type { LintRule } from "../runtime/lintDocument";
import { exists, targetHas, valueWhen } from "./define";

export const planItemRules: LintRule[] = [
	exists({
		field: "featureId",
		in: "features",
		matching: "featureId",
		because: "A plan item meters a feature this config does not declare.",
	}),
	targetHas({
		when: "featureOverride",
		field: "featureId",
		in: "features",
		matching: "featureId",
		target: "type",
		equals: "credit_system",
		because:
			"featureOverride is only honoured on classic credit-system features.",
	}),
];

export const planItemPriceRules: LintRule[] = [
	valueWhen({
		when: "tierBehavior",
		equals: "volume",
		field: "billingMethod",
		mustBe: "prepaid",
		because: "Volume tiers are prepaid-only.",
	}),
];
