import type { ApiPlanParams } from "../../../../atmn/src/lib/transforms/sdkToApi/plan.ts";
import type { Expectation } from "../types/expectation.ts";
import type { PlanSpec } from "../types/planSpec.ts";
import { subsetMatch } from "./subsetMatch.ts";

const planMatches = (spec: PlanSpec, plan: ApiPlanParams): boolean => {
	const { freePlan, ...subset } = spec;
	if (freePlan && plan.price !== undefined) return false;
	return subsetMatch(subset, plan);
};

export const config = {
	/** autumn.config.ts exists, parses, and passes atmn validation */
	valid: (): Expectation => ({
		name: "config parses and passes validation",
		kind: "config",
		score: (output) => {
			const { configFound, parseError, validationErrors } = output.config;
			const why = !configFound
				? "no autumn.config.ts was written"
				: parseError
					? `config does not parse: ${parseError.slice(0, 80)}`
					: validationErrors
						? `atmn validation failed: ${validationErrors[0]}`
						: undefined;
			return {
				name: "config parses and passes validation",
				score: why ? 0 : 1,
				metadata: { why, parseError, validationErrors },
			};
		},
	}),

	/** some plan in the config structurally matches the spec */
	plan: (label: string, spec: PlanSpec): Expectation => ({
		name: `has plan: ${label}`,
		kind: "config",
		score: (output) => {
			const matched = output.config.plans.some((plan) =>
				planMatches(spec, plan),
			);
			const why = matched
				? undefined
				: output.config.plans.length === 0
					? "the config has no plans"
					: `none of the ${output.config.plans.length} plans match the expected shape`;
			return {
				name: `has plan: ${label}`,
				score: matched ? 1 : 0,
				metadata: { why, spec, plans: output.config.plans },
			};
		},
	}),

	/** a boolean feature exists and some plan grants it (id-agnostic) */
	booleanFeatureOnPlan: (): Expectation => ({
		name: "a plan grants a boolean (on/off) feature",
		kind: "config",
		score: (output) => {
			const booleanFeatureIds = output.config.features
				.filter((feature) => feature.type === "boolean")
				.map((feature) => feature.id);
			const granted = output.config.plans.some((plan) =>
				(plan.items ?? []).some((item) =>
					booleanFeatureIds.includes(String(item.feature_id ?? "")),
				),
			);
			const why = granted
				? undefined
				: booleanFeatureIds.length === 0
					? "no boolean feature was modeled"
					: "a boolean feature exists but no plan grants it";
			return {
				name: "a plan grants a boolean (on/off) feature",
				score: granted ? 1 : 0,
				metadata: { why, booleanFeatureIds },
			};
		},
	}),

	/** prepaid purchases live only on add-on plans — a prepaid-priced item on a
	 * base plan means packs were wrongly duplicated into the subscriptions */
	noPrepaidOnBasePlans: (): Expectation => ({
		name: "base plans carry no prepaid items",
		kind: "config",
		score: (output) => {
			const polluted = output.config.plans.filter(
				(plan) =>
					!plan.add_on &&
					(plan.items ?? []).some(
						(item) => item.price?.billing_method === "prepaid",
					),
			);
			return {
				name: "base plans carry no prepaid items",
				score: output.config.plans.length > 0 && polluted.length === 0 ? 1 : 0,
				metadata:
					output.config.plans.length === 0
						? { why: "the config has no plans" }
						: polluted.length === 0
							? undefined
							: {
									why: "prepaid packs were modeled onto base plans instead of a separate add-on",
									pollutedPlanIds: polluted.map((plan) => plan.id),
								},
			};
		},
	}),

	/** exactly n plans were modeled */
	planCount: (count: number): Expectation => ({
		name: `modeled exactly ${count} plans`,
		kind: "config",
		score: (output) => {
			const actual = output.config.plans.length;
			return {
				name: `modeled exactly ${count} plans`,
				score: actual === count ? 1 : 0,
				metadata:
					actual === count
						? { expected: count, actual }
						: { why: `expected ${count} plans, found ${actual}`, actual },
			};
		},
	}),
};
