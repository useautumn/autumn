import type { Feature } from "../../../compose/models/index.js";
import type { Plan } from "../../../compose/models/variantModels.js";
import { buildFeatureCode } from "./feature.js";
import { resolveVarNames } from "./helpers.js";
import { buildImports } from "./imports.js";
import { buildPlanCode } from "./plan.js";
import { buildVariantCode } from "./variant.js";

const versionedCodegenId = ({
	id,
	version,
}: {
	id: string;
	version?: number;
}) => (version === undefined ? id : `${id}-v-${version}`);

/**
 * Generate complete autumn.config.ts file content
 */
export function buildConfigFile(features: Feature[], plans: Plan[]): string {
	const sections: string[] = [];

	// Resolve var names up front so collisions (e.g. a feature and plan both
	// named "free") are disambiguated before any code is emitted.
	const { featureVarMap, planVarMap, variantVarMap } = resolveVarNames(
		features.map((f) => f.id),
		plans.map(versionedCodegenId),
		plans.flatMap(
			(p) => p.variants?.map((variant) => versionedCodegenId(variant)) ?? [],
		),
	);

	// Add imports
	sections.push(
		buildImports({
			includeBillingControls: plans.some((plan) => plan.billingControls),
		}),
	);
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
			const planVarName = planVarMap.get(versionedCodegenId(plan));
			sections.push(buildPlanCode(plan, features, featureVarMap, planVarName));
			sections.push("");
			for (const planVariant of plan.variants ?? []) {
				sections.push(
					buildVariantCode({
						basePlanVarName: planVarName!,
						variant: planVariant,
						features,
						featureVarMap,
						varNameOverride: variantVarMap.get(versionedCodegenId(planVariant)),
					}),
				);
				sections.push("");
			}
		}
	}

	return sections.join("\n");
}
