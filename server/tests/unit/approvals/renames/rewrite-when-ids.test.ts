/**
 * Rewriting a renamed plan or feature id inside a rule's `when` (Track D, D3).
 *
 * Contract: every value under the id key moves (bare, $eq/$ne, $in/$nin, any depth);
 * other keys and other ids are untouched; the input isn't mutated.
 */

import { describe, expect, test } from "bun:test";
import { rewriteWhenIds } from "@/internal/approvals/renames/rewriteWhenIds.js";

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

describe("rewriteWhenIds", () => {
	test("moves every plan_id reference and nothing else", () => {
		const result = rewriteWhenIds({
			when: enterpriseTrials,
			key: "plan_id",
			fromId: "pro",
			toId: "pro_v2",
		});

		expect(result).toEqual({
			...enterpriseTrials,
			incoming: { $every: { plan_id: "pro_v2", $or: [{ free_trial: null }] } },
			outgoing: { $none: { plan_id: { $in: ["pro_v2", "starter"] } } },
			customer: { plan: { $some: { plan_id: { $ne: "pro_v2" } } } },
		});
		expect(enterpriseTrials.incoming.$every.plan_id).toBe("pro");
	});

	test("feature ids move under feature_id only, including $eq and $nin", () => {
		const when = {
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
			rewriteWhenIds({
				when,
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

	test("null and unrelated whens come back unchanged", () => {
		expect(
			rewriteWhenIds({ when: null, key: "plan_id", fromId: "a", toId: "b" }),
		).toBeNull();
		const when = { paid: true };
		expect(
			rewriteWhenIds({ when, key: "plan_id", fromId: "a", toId: "b" }),
		).toEqual(when);
	});
});
