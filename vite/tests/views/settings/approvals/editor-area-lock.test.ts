/**
 * Contract: a rule's actions come from one area. Once an action is picked,
 * every other area is locked until those actions are cleared.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction, ApprovalArea } from "@autumn/shared";
import {
	actionAreas,
	toggleAction,
} from "@/views/settings/sections/approvals/editor/ruleActions";

const lockedAreas = (actions: ApprovalAction[]) =>
	actionAreas({ actions })
		.filter((area) => area.locked)
		.map((area) => area.area);

describe("editor area lock", () => {
	test("nothing is locked before an action is picked", () => {
		expect(lockedAreas([])).toEqual([]);
	});

	test.each<[ApprovalAction[], ApprovalArea]>([
		[["billing.attach"], "billing"],
		[["billing.attach", "billing.cancel"], "billing"],
		[["balances.create"], "balances"],
		[["members.change_role"], "members"],
	])("%p locks every area but %s", (actions, area) => {
		const locked = lockedAreas(actions);
		expect(locked).not.toContain(area);
		expect(locked).toHaveLength(actionAreas({ actions: [] }).length - 1);
	});

	test("areas list every action in board order", () => {
		const billing = actionAreas({ actions: [] }).find(
			(area) => area.area === "billing",
		);
		expect(billing?.label).toBe("Billing");
		expect(billing?.actions.map((action) => action.label)).toEqual([
			"Attach",
			"Update subscription",
			"Set plans",
			"Schedule",
			"Cancel",
			"Uncancel",
		]);
	});

	test("picking an action in a locked area changes nothing", () => {
		const actions: ApprovalAction[] = ["billing.attach"];
		expect(toggleAction({ actions, action: "balances.create" })).toBe(actions);
	});

	test("picking within the area adds, picking again removes", () => {
		const added = toggleAction({
			actions: ["billing.attach"],
			action: "billing.update_subscription",
		});
		expect(added).toEqual(["billing.attach", "billing.update_subscription"]);
		expect(toggleAction({ actions: added, action: "billing.attach" })).toEqual([
			"billing.update_subscription",
		]);
	});

	test("clearing the last action unlocks the other areas", () => {
		const cleared = toggleAction({
			actions: ["billing.attach"],
			action: "billing.attach",
		});
		expect(lockedAreas(cleared)).toEqual([]);
		expect(
			toggleAction({ actions: cleared, action: "balances.create" }),
		).toEqual(["balances.create"]);
	});
});
