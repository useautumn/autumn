import type { LintRule } from "../runtime/lintDocument";
import { exists } from "./define";

export const planItemRules: LintRule[] = [
	exists({
		field: "featureId",
		in: "features",
		matching: "featureId",
		because: "A plan item meters a feature this config does not declare.",
	}),
];
