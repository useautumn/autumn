import type { Feature } from "../../../compose/models/index.js";
import type { Plan } from "../../../compose/models/variantModels.js";
import { buildFeatureCode } from "./feature.js";
import { resolveVarNames } from "./helpers.js";
import { buildImports } from "./imports.js";
import { buildPlanCode } from "./plan.js";
import { buildVariantCode } from "./variant.js";
import type { ReferralProgram, Reward } from "../../../compose/index.js";
import { buildReferralProgramCode, buildRewardCode } from "./reward.js";

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
export function buildConfigFile(
	features: Feature[],
	plans: Plan[],
	rewards: Reward[] = [],
	referralPrograms: ReferralProgram[] = [],
): string {
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
			includeRewards: rewards.length > 0,
			includeReferralPrograms: referralPrograms.length > 0,
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
	if (rewards.length > 0) {
		sections.push("// Rewards");
		for (const reward of rewards) sections.push(buildRewardCode(reward), "");
	}
	if (referralPrograms.length > 0) {
		sections.push("// Referral programs");
		for (const program of referralPrograms)
			sections.push(buildReferralProgramCode(program), "");
	}

	return sections.join("\n");
}
