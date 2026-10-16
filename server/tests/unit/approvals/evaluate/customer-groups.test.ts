/**
 * S4a contract: customer `$and`/`$or` groups match branch by branch like the rest
 * of the filter, so an unsupported branch never hides a matching one, and the
 * matched branch's conditions are reported.
 *
 * Red (before):  the whole customer filter went to one boolean matcher.
 * Green (after): each case matches and reports as listed.
 */

import { describe, expect, test } from "bun:test";
import { matchRuleFilter } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const attachFor = ({ hasPaid }: { hasPaid: boolean }) =>
	facts.billingChange({ customer: facts.customer({ hasPaid }) });

const match = ({
	effect,
	customer,
	hasPaid,
}: {
	effect: "allow" | "block";
	customer: Record<string, unknown>;
	hasPaid: boolean;
}) =>
	matchRuleFilter({
		rule: { ...rules[effect](), filter: { customer } as never },
		action: "billing.attach",
		facts: attachFor({ hasPaid }),
		context: matchContext,
	});

const paidCondition = {
	field: "customer.has_paid",
	label: "Customer has paid before",
	limit: "has paid before",
	actual: "has paid before",
};

describe("customer groups", () => {
	test("a matching $or branch wins over an unsupported one, even for an allow", () => {
		const customer = {
			$or: [{ customer_id: { $regex: "^cus_" } }, { has_paid: true }],
		};
		expect(match({ effect: "allow", customer, hasPaid: true })).toEqual({
			matches: true,
			conditions: [paidCondition],
		});
	});

	test("an $or reports the condition of the branch that matched", () => {
		const customer = { $or: [{ customer_id: "cus_vip" }, { has_paid: true }] };
		expect(match({ effect: "block", customer, hasPaid: true })).toEqual({
			matches: true,
			conditions: [paidCondition],
		});
	});

	test("grouped conditions are kept next to a direct field", () => {
		const customer = {
			customer_id: { $ne: "cus_vip" },
			$and: [{ has_paid: true }],
		};
		const { conditions } = match({ effect: "block", customer, hasPaid: true });
		expect(conditions.map((condition) => condition.field)).toEqual([
			"customer.customer_id",
			"customer.has_paid",
		]);
	});

	test("a branch that can't hold makes the $or no-match", () => {
		const customer = { $or: [{ customer_id: "cus_vip" }, { has_paid: true }] };
		expect(match({ effect: "block", customer, hasPaid: false })).toEqual({
			matches: false,
			conditions: [],
		});
	});
});
