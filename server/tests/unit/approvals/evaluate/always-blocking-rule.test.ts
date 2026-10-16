/**
 * S4b contract (`approvals.can` support): `findAlwaysBlockingRule` returns the
 * unconditional block that decides every request for this person, or null.
 *
 * Red (before):  `findAlwaysBlockingRule` doesn't exist.
 * Green (after): each case returns the listed rule or null.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRuleParams } from "@autumn/shared";
import { findAlwaysBlockingRule } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { principals, storedRules } from "./utils/principals.js";

const sam = principals.member({ roleId: "sales", userId: "usr_sam" });
const sales = { type: "role", role_id: "sales" } as const;

const find = (ruleList: ApprovalRuleParams[]) =>
	findAlwaysBlockingRule({
		principal: sam,
		action: "billing.attach",
		rules: storedRules(ruleList),
	});

describe("findAlwaysBlockingRule", () => {
	test("no rules, or only conditional blocks → null", () => {
		expect(find([])).toBeNull();
		expect(find([rules.block({ filter: { paid: true } })])).toBeNull();
	});

	test("an unconditional block naming the person → that rule", () => {
		expect(find([rules.block({ name: "Locked" })])).toMatchObject({
			level: "everyone",
			rule_name: "Locked",
		});
	});

	test("an empty filter counts as unconditional", () => {
		expect(find([rules.block({ name: "Empty", filter: {} })])).toMatchObject({
			rule_name: "Empty",
		});
	});

	test("a more specific allow, even a conditional one, lifts it", () => {
		expect(
			find([
				rules.block(),
				rules.allow({ subjects: [sales], filter: { paid: false } }),
			]),
		).toBeNull();
	});

	test("a less specific allow doesn't lift a role block", () => {
		expect(
			find([
				rules.block({ name: "Sales locked", subjects: [sales] }),
				rules.allow(),
			]),
		).toMatchObject({ level: "role", rule_name: "Sales locked" });
	});

	test("within a level, an allow earlier in the list doesn't lift a later block", () => {
		expect(
			find([
				rules.allow({ subjects: [sales] }),
				rules.block({ name: "Later block", subjects: [sales] }),
			]),
		).toMatchObject({ rule_name: "Later block" });
		expect(
			find([
				rules.block({ subjects: [sales] }),
				rules.allow({ subjects: [sales] }),
			]),
		).toBeNull();
	});

	test("disabled rules and other actions don't count", () => {
		expect(find([rules.block({ enabled: false })])).toBeNull();
		expect(find([rules.block({ actions: ["billing.cancel"] })])).toBeNull();
	});
});
