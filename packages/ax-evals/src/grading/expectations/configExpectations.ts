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

	/** non-add-on plans form exactly `count` groups (names are the agent's
	 * choice), each with one free auto-enabled default. Catches merging
	 * independent product lines into one lineup. */
	planGroups: ({ count }: { count: number }): Expectation => {
		const name = `plans form ${count} groups, each with a free default`;
		return {
			name,
			kind: "config",
			score: (output) => {
				const basePlans = output.config.plans.filter((plan) => !plan.add_on);
				const groups = new Map<string, ApiPlanParams[]>();
				for (const plan of basePlans) {
					const key = plan.group ?? "";
					groups.set(key, [...(groups.get(key) ?? []), plan]);
				}
				if (groups.size !== count) {
					return {
						name,
						score: 0,
						metadata: {
							why: `expected ${count} plan groups among non-add-on plans, found ${groups.size}`,
							groupsFound: [...groups.keys()],
						},
					};
				}
				const groupsMissingDefault = [...groups.entries()]
					.filter(
						([, plans]) =>
							!plans.some(
								(plan) => plan.price === undefined && plan.auto_enable === true,
							),
					)
					.map(([key]) => key || "(no group)");
				return {
					name,
					score: groupsMissingDefault.length === 0 ? 1 : 0,
					metadata:
						groupsMissingDefault.length === 0
							? undefined
							: {
									why: "a group has no free auto-enabled default plan",
									groupsMissingDefault,
								},
				};
			},
		};
	},

	/** at least `count` plans were written as `.variant()` of a base plan —
	 * catches sibling tiers copy-pasted as standalone plan() declarations */
	definedAsVariants: ({ count }: { count: number }): Expectation => {
		const name = `at least ${count} plans defined as variants`;
		return {
			name,
			kind: "config",
			score: (output) => {
				const variantIds = output.config.variantPlanIds ?? [];
				return {
					name,
					score: variantIds.length >= count ? 1 : 0,
					metadata:
						variantIds.length >= count
							? { variantIds }
							: {
									why: `expected at least ${count} .variant() plans, found ${variantIds.length}`,
									variantIds,
								},
				};
			},
		};
	},

	/** exactly one plan is handed out as a license across the catalog —
	 * catches minting a seat plan per tier instead of reusing one */
	oneLicensePlan: (): Expectation => ({
		name: "exactly one license plan, reused across plans",
		kind: "config",
		score: (output) => {
			const referencedIds = new Set(
				output.config.plans.flatMap((plan) =>
					(plan.licenses ?? []).map((license) => license.license_plan_id),
				),
			);
			const why =
				referencedIds.size === 0
					? "no plan hands out licenses — seats were not modeled as a license plan"
					: referencedIds.size > 1
						? "several different license plans exist; tiers should reuse one seat plan"
						: undefined;
			return {
				name: "exactly one license plan, reused across plans",
				score: referencedIds.size === 1 ? 1 : 0,
				metadata: why
					? { why, referencedIds: [...referencedIds] }
					: { referencedIds: [...referencedIds] },
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
