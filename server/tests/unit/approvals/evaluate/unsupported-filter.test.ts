/**
 * S4a contract (audit §3.3, Q4): a condition the evaluator can't judge resolves
 * pessimistically by effect: a block applies and says so, an allow doesn't.
 *
 * Red (before):  unsupported conditions failed closed only through allow rules.
 * Green (after): the same filter matches as a block and not as an allow.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleFilter } from "@autumn/shared";
import { matchRuleFilter } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const matchBoth = ({ filter }: { filter: ApprovalRuleFilter }) => {
	const change = facts.billingChange({
		paid: true,
		incoming: [facts.incomingPlan({ planId: "pro" })],
	});
	const matchAs = (rule: ReturnType<typeof rules.block>) =>
		matchRuleFilter({
			rule,
			action: "billing.attach",
			facts: change,
			context: matchContext,
		});
	return {
		block: matchAs(rules.block({ filter })),
		allow: matchAs(rules.allow({ filter })),
	};
};

describe("unsupported filters", () => {
	test("an empty $or: a block applies, an allow doesn't", () => {
		const { block, allow } = matchBoth({ filter: { $or: [] } });

		expect(block).toEqual({
			matches: true,
			conditions: [
				{
					field: "$or",
					label: "Unsupported condition",
					limit: "Can't be checked",
					actual: "Unknown",
				},
			],
		});
		expect(allow).toEqual({ matches: false, conditions: [] });
	});

	test("custom on an incoming plan is unknown: a block applies, an allow doesn't", () => {
		const { block, allow } = matchBoth({
			filter: { paid: true, incoming: { $some: { custom: true } } },
		});

		expect(block).toEqual({
			matches: true,
			conditions: [
				{ field: "paid", label: "Charges customer", limit: true, actual: true },
				{
					field: "incoming[0].custom",
					label: "Unsupported condition",
					limit: "Can't be checked",
					actual: "Unknown",
				},
			],
		});
		expect(allow.matches).toBe(false);
	});

	test("a key from another area is unknown here", () => {
		const { block, allow } = matchBoth({
			filter: { cancel_action: "cancel_immediately" },
		});

		expect(block.matches).toBe(true);
		expect(block.conditions[0]).toMatchObject({
			field: "cancel_action",
			label: "Unsupported condition",
			limit: "Can't be checked",
		});
		expect(allow.matches).toBe(false);
	});

	test("a known field whose matcher can't check the value keeps its label", () => {
		const { block } = matchBoth({
			filter: { incoming: { $some: { plan_id: { $regex: "^pro" } } } },
		});

		expect(block).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming[0].plan_id",
					label: "Incoming plan",
					limit: "Can't be checked",
					actual: "Unknown",
				},
			],
		});
	});

	test("a filter that isn't an object reports a readable condition at filter", () => {
		const { block } = matchBoth({ filter: [] as never });
		expect(block.conditions).toEqual([
			{
				field: "filter",
				label: "Unsupported condition",
				limit: "Can't be checked",
				actual: "Unknown",
			},
		]);
	});

	test("a condition that can't hold outweighs an unsupported one", () => {
		const { block } = matchBoth({ filter: { $or: [], checkout: true } });

		expect(block).toEqual({ matches: false, conditions: [] });
	});

	test("a matching $or branch outweighs an unsupported one", () => {
		const { allow } = matchBoth({
			filter: {
				$or: [{ incoming: { $some: { custom: true } } }, { paid: true }],
			},
		});

		expect(allow).toEqual({
			matches: true,
			conditions: [
				{ field: "paid", label: "Charges customer", limit: true, actual: true },
			],
		});
	});
});
