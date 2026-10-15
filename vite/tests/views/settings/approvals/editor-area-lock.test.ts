/** Contract: a rule's actions come from one area; picking one locks the others until cleared. */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction, ApprovalArea } from "@autumn/shared";
import {
	actionAreas,
	toggleAction,
} from "@/views/settings/sections/approvals/editor/ruleActions";

const lockedAreas = (actions: ApprovalAction[]) =>
	actionAreas({ actions }).flatMap(({ area, locked }) =>
		locked ? [area] : [],
	);
const areaCount = actionAreas({ actions: [] }).length;

describe("editor area lock", () => {
	test.each<[ApprovalAction[], ApprovalArea | null]>([
		[[], null],
		[["billing.attach"], "billing"],
		[["billing.attach", "billing.cancel"], "billing"],
		[["balances.create"], "balances"],
		[["members.change_role"], "members"],
	])("%p leaves only %s open", (actions, open) => {
		const locked = lockedAreas(actions);
		expect(locked).toHaveLength(open ? areaCount - 1 : 0);
		expect(locked).not.toContain(open);
	});

	test("areas list their actions in board order", () => {
		const billing = actionAreas({ actions: [] })[0];
		expect([
			billing.label,
			...billing.actions.map(({ label }) => label),
		]).toEqual([
			"Billing",
			"Attach",
			"Update subscription",
			"Set plans",
			"Schedule",
			"Cancel",
			"Uncancel",
		]);
	});

	test.each<[ApprovalAction[], ApprovalAction, ApprovalAction[]]>([
		[["billing.attach"], "balances.create", ["billing.attach"]],
		[
			["billing.attach"],
			"billing.update_subscription",
			["billing.attach", "billing.update_subscription"],
		],
		[
			["billing.attach", "billing.cancel"],
			"billing.attach",
			["billing.cancel"],
		],
		[["billing.attach"], "billing.attach", []],
		[[], "balances.create", ["balances.create"]],
	])("%p + %s → %p", (actions, action, expected) => {
		expect(toggleAction({ actions, action })).toEqual(expected);
	});
});
