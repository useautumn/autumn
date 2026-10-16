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
		[["plans.update"], "plans"],
		[["api_keys.create"], "api_keys"],
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
			"Create schedule",
			"Cancel",
			"Uncancel",
		]);
	});

	test("plans and features are separate areas under Catalog", () => {
		const labels = actionAreas({ actions: [] }).map(({ label }) => label);
		expect(labels).toContain("Catalog · Plans");
		expect(labels).toContain("Catalog · Features");
		expect(
			toggleAction({ actions: ["plans.create"], action: "features.create" }),
		).toEqual(["plans.create"]);
	});

	test.each<[ApprovalAction[], ApprovalAction, ApprovalAction[]]>([
		[["billing.attach"], "balances.create", ["billing.attach"]],
		[
			["billing.attach"],
			"billing.update",
			["billing.attach", "billing.update"],
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

	test("member actions are deferred, so Members isn't offered", () => {
		const offered = actionAreas({ actions: [] }).flatMap(({ actions }) =>
			actions.map(({ value }) => value as string),
		);
		expect(offered.filter((action) => action.startsWith("members."))).toEqual(
			[],
		);
	});
});
