import type { Feature } from "../../../compose/models/index.js";
import type { Plan } from "../../../compose/models/variantModels.js";
import { buildFeatureCode } from "./feature.js";
import { resolveVarNames } from "./helpers.js";
import { buildImports } from "./imports.js";
import { buildPlanCode } from "./plan.js";
import { buildVariantCode } from "./variant.js";

/**
 * Generate complete autumn.config.ts file content
 */
export function buildConfigFile(features: Feature[], plans: Plan[]): string {
	const sections: string[] = [];

	// Resolve var names up front so collisions (e.g. a feature and plan both
	// named "free") are disambiguated before any code is emitted.
	const { featureVarMap, planVarMap, variantVarMap } = resolveVarNames(
		features.map((f) => f.id),
		plans.map((p) => p.id),
		plans.flatMap((p) => p.variants?.map((variant) => variant.id) ?? []),
	);

	// Add imports
	sections.push(buildImports());
	sections.push("");

	// Add features
	if (features.length > 0) {
		sections.push("// Features");
		for (const feature of features) {
			sections.push(buildFeatureCode(feature, featureVarMap.get(feature.id)));
			sections.push("");
		}
	}

	// Add plans
	if (plans.length > 0) {
		sections.push("// Plans");
		for (const plan of plans) {
			const planVarName = planVarMap.get(plan.id);
			sections.push(buildPlanCode(plan, features, featureVarMap, planVarName));
			sections.push("");
			for (const planVariant of plan.variants ?? []) {
				sections.push(
					buildVariantCode({
						basePlanVarName: planVarName!,
						variant: planVariant,
						features,
						featureVarMap,
						varNameOverride: variantVarMap.get(planVariant.id),
					}),
				);
				sections.push("");
			}
		}
	}

	return sections.join("\n");
}
