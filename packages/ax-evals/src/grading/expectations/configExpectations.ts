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
		name: "config valid",
		kind: "config",
		score: (output) => ({
			name: "config valid",
			score:
				output.config.configFound &&
				!output.config.parseError &&
				!output.config.validationErrors
					? 1
					: 0,
			metadata: {
				parseError: output.config.parseError,
				validationErrors: output.config.validationErrors,
			},
		}),
	}),

	/** some plan in the config structurally matches the spec */
	plan: (label: string, spec: PlanSpec): Expectation => ({
		name: `plan: ${label}`,
		kind: "config",
		score: (output) => ({
			name: `plan: ${label}`,
			score: output.config.plans.some((plan) => planMatches(spec, plan))
				? 1
				: 0,
			metadata: { spec, plans: output.config.plans },
		}),
	}),

	/** exactly n plans were modeled */
	planCount: (count: number): Expectation => ({
		name: "plan count",
		kind: "config",
		score: (output) => ({
			name: "plan count",
			score: output.config.plans.length === count ? 1 : 0,
			metadata: { expected: count, actual: output.config.plans.length },
		}),
	}),
};
