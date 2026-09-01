import type { ApiPlanParams } from "../../../../atmn/src/lib/transforms/sdkToApi/plan.ts";
import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { Expectation } from "../types/expectation.ts";
import type { PlanSpec } from "../types/planSpec.ts";
import { subsetMatch } from "./subsetMatch.ts";

/** A feature the catalog must contain — id-agnostic, matched by type; when
 * `granted`, some plan must also grant it via an item. */
export type FeatureSpec = {
	type: "boolean" | "metered" | "credit_system";
	granted?: boolean;
};

/**
 * The expected catalog, shaped like autumn.config.ts: features + plans, keyed
 * by human labels (ids are the agent's choice). One declaration expands to
 * one named verdict per part, all reading the same inspected config.
 */
export type CatalogSpec = {
	features?: Record<string, FeatureSpec>;
	plans: Record<string, PlanSpec>;
	/** when true (default), the config must contain exactly these plans */
	exactPlans?: boolean;
};

const planMatches = (spec: PlanSpec, plan: ApiPlanParams): boolean => {
	const { freePlan, ...subset } = spec;
	if (freePlan && plan.price !== undefined) return false;
	return subsetMatch(subset, plan);
};

/** Per-field ✓/✗ against the plan that matches the most spec fields, so a
 * failed verdict says which field missed instead of "no plan matched". */
const closestPlanDiff = (
	spec: PlanSpec,
	plans: ApiPlanParams[],
): Record<string, unknown> | undefined => {
	const { freePlan, ...subset } = spec;
	const fields = Object.entries(subset);
	if (plans.length === 0 || fields.length === 0) return undefined;
	let best: { id: string; diff: Record<string, string>; matched: number } = {
		id: "",
		diff: {},
		matched: -1,
	};
	for (const plan of plans) {
		const diff: Record<string, string> = {};
		let matched = 0;
		for (const [key, value] of fields) {
			const ok = subsetMatch(
				value,
				(plan as unknown as Record<string, unknown>)[key],
			);
			diff[key] = ok ? "✓" : `✗ expected ${JSON.stringify(value)}`;
			if (ok) matched++;
		}
		if (freePlan) {
			const ok = plan.price === undefined;
			diff.freePlan = ok ? "✓" : "✗ plan has a price";
			if (ok) matched++;
		}
		if (matched > best.matched) best = { id: plan.id ?? "?", diff, matched };
	}
	return { closestPlan: best.id, fields: best.diff };
};

const featureVerdict = (label: string, spec: FeatureSpec): Expectation => ({
	name: `has feature: ${label}`,
	kind: "config",
	score: (output: AxRunOutput) => {
		const ofType = output.config.features.filter(
			(feature) => feature.type === spec.type,
		);
		if (ofType.length === 0) {
			return {
				name: `has feature: ${label}`,
				score: 0,
				metadata: {
					why: `no ${spec.type} feature was modeled`,
					featuresFound: output.config.features,
				},
			};
		}
		if (!spec.granted) return { name: `has feature: ${label}`, score: 1 };
		const ids = ofType.map((feature) => feature.id);
		const granted = output.config.plans.some((plan) =>
			(plan.items ?? []).some((item) =>
				ids.includes(String(item.feature_id ?? "")),
			),
		);
		return {
			name: `has feature: ${label}`,
			score: granted ? 1 : 0,
			metadata: granted
				? undefined
				: { why: `a ${spec.type} feature exists but no plan grants it` },
		};
	},
});

const planVerdict = (label: string, spec: PlanSpec): Expectation => ({
	name: `has plan: ${label}`,
	kind: "config",
	score: (output: AxRunOutput) => {
		const matched = output.config.plans.some((plan) => planMatches(spec, plan));
		if (matched) return { name: `has plan: ${label}`, score: 1 };
		return {
			name: `has plan: ${label}`,
			score: 0,
			metadata:
				output.config.plans.length === 0
					? { why: "the config has no plans" }
					: {
							why: "no plan matches; closest shown in fields",
							...closestPlanDiff(spec, output.config.plans),
						},
		};
	},
});

export const catalog = (spec: CatalogSpec): Expectation[] => {
	const planLabels = Object.keys(spec.plans);
	const expectations: Expectation[] = [
		{
			name: "config parses and passes validation",
			kind: "config",
			score: (output: AxRunOutput) => {
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
		},
	];
	if (spec.exactPlans !== false) {
		expectations.push({
			name: `modeled exactly ${planLabels.length} plans`,
			kind: "config",
			score: (output: AxRunOutput) => ({
				name: `modeled exactly ${planLabels.length} plans`,
				score: output.config.plans.length === planLabels.length ? 1 : 0,
				metadata:
					output.config.plans.length === planLabels.length
						? undefined
						: {
								why: `expected ${planLabels.length} plans, found ${output.config.plans.length}`,
								planIds: output.config.plans.map((plan) => plan.id),
							},
			}),
		});
	}
	for (const [label, planSpec] of Object.entries(spec.plans))
		expectations.push(planVerdict(label, planSpec));
	for (const [label, featureSpec] of Object.entries(spec.features ?? {}))
		expectations.push(featureVerdict(label, featureSpec));
	return expectations;
};
