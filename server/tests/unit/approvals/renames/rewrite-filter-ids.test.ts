/**
 * Rewriting a renamed plan or feature id inside a rule's `filter` (Stage 3, D3).
 *
 * Contract: every value under the id key moves (bare, $eq/$ne, $in/$nin, any depth, including
 * entity.feature_id); other keys, other ids, durations and has_paid are untouched; the input isn't mutated.
 */

import { describe, expect, test } from "bun:test";
import { rewriteFilterIds } from "@/internal/approvals/renames/rewriteFilterIds.js";

const enterpriseTrials = {
	paid: false,
	incoming: {
		$every: {
			plan_id: "pro",
			$or: [{ free_trial: null }],
		},
	},
	outgoing: { $none: { plan_id: { $in: ["pro", "starter"] } } },
	customer: { plan: { $some: { plan_id: { $ne: "pro" } } } },
	discounts: { $every: { reward_id: "pro" } },
};

describe("rewriteFilterIds", () => {
	test("moves every plan_id reference and nothing else", () => {
		expect(
			rewriteFilterIds({
				filter: enterpriseTrials,
				key: "plan_id",
				fromId: "pro",
				toId: "pro_v2",
			}),
		).toEqual({
			...enterpriseTrials,
			incoming: { $every: { plan_id: "pro_v2", $or: [{ free_trial: null }] } },
			outgoing: { $none: { plan_id: { $in: ["pro_v2", "starter"] } } },
			customer: { plan: { $some: { plan_id: { $ne: "pro_v2" } } } },
		});
		expect(enterpriseTrials.incoming.$every.plan_id).toBe("pro");
	});

	test("feature ids move under feature_id only, including $eq and $nin", () => {
		const filter = {
			feature_id: { $eq: "ai_credits" },
			incoming: {
				$every: {
					feature_quantities: {
						$every: { feature_id: { $nin: ["ai_credits"] } },
					},
					plan_id: "ai_credits",
				},
			},
		};
		expect(
			rewriteFilterIds({
				filter,
				key: "feature_id",
				fromId: "ai_credits",
				toId: "credits",
			}),
		).toEqual({
			feature_id: { $eq: "credits" },
			incoming: {
				$every: {
					feature_quantities: { $every: { feature_id: { $nin: ["credits"] } } },
					plan_id: "ai_credits",
				},
			},
		});
	});

	test("entity.feature_id moves on a feature rename; a null entity branch stays", () => {
		const filter = {
			entity: { feature_id: { $ne: "deployments" } },
			$or: [{ entity: null }],
		};
		expect(
			rewriteFilterIds({
				filter,
				key: "feature_id",
				fromId: "deployments",
				toId: "seats",
			}),
		).toEqual({
			entity: { feature_id: { $ne: "seats" } },
			$or: [{ entity: null }],
		});
	});

	test("duration matchers and has_paid are not ids", () => {
		const filter = {
			customer: { has_paid: true },
			incoming: {
				$every: {
					plan_id: "month",
					free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
				},
			},
		};
		expect(
			rewriteFilterIds({
				filter,
				key: "plan_id",
				fromId: "month",
				toId: "monthly",
			}),
		).toEqual({
			customer: { has_paid: true },
			incoming: {
				$every: {
					plan_id: "monthly",
					free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
				},
			},
		});
	});

	test("null and unrelated filters come back unchanged", () => {
		expect(
			rewriteFilterIds({
				filter: null,
				key: "plan_id",
				fromId: "a",
				toId: "b",
			}),
		).toBeNull();
		const filter = { paid: true };
		expect(
			rewriteFilterIds({ filter, key: "plan_id", fromId: "a", toId: "b" }),
		).toEqual(filter);
	});
});
