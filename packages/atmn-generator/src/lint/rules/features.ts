import type { LintRule } from "../runtime/lintDocument";
import { requiredWhen } from "./define";

export const featureRules: LintRule[] = [
	requiredWhen({
		when: "type",
		equals: "metered",
		require: ["consumable"],
		because:
			"Omitting it silently creates a non-consumable feature, which never resets.",
	}),
];
