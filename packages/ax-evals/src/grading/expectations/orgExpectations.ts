import type { OracleCatalogPlan } from "../sandboxOracle.ts";
import type { Expectation } from "../types/expectation.ts";
import type { PlanSpec } from "../types/planSpec.ts";
import { subsetMatch } from "./subsetMatch.ts";

/** The org's plan rows read after the run — the outcome, not the file. */
const planMatches = (spec: PlanSpec, plan: OracleCatalogPlan): boolean => {
	const { freePlan, ...subset } = spec;
	const price = plan.price ?? undefined;
	if (freePlan && price !== undefined) return false;
	return subsetMatch(subset, { ...plan, price });
};

export const org = {
	/** the org holds exactly `count` versions of the plan */
	planVersions: ({
		planId,
		count,
	}: {
		planId: string;
		count: number;
	}): Expectation => {
		const name = `org holds ${count} versions of ${planId}`;
		return {
			name,
			kind: "config",
			score: (output) => {
				const rows = (output.catalog?.plans ?? []).filter(
					(plan) => plan.id === planId,
				);
				return {
					name,
					score: rows.length === count ? 1 : 0,
					metadata:
						rows.length === count
							? undefined
							: {
									why: output.catalog
										? `the org holds ${rows.length} versions of ${planId}`
										: "the org's catalog was not captured",
									versions: rows.map((row) => row.version_slug ?? row.version),
								},
				};
			},
		};
	},

	/** some active plan row in the org matches the spec */
	activePlan: (label: string, spec: PlanSpec): Expectation => {
		const name = `org's active plan: ${label}`;
		return {
			name,
			kind: "config",
			score: (output) => {
				const active = (output.catalog?.plans ?? []).filter(
					(plan) => plan.active,
				);
				const matched = active.some((plan) => planMatches(spec, plan));
				return {
					name,
					score: matched ? 1 : 0,
					metadata: matched
						? undefined
						: {
								why: output.catalog
									? `none of the ${active.length} active plans match`
									: "the org's catalog was not captured",
								spec,
								active,
							},
				};
			},
		};
	},
};
