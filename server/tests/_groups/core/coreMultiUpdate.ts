import type { TestGroup } from "../types";

export const coreMultiUpdate: TestGroup = {
	name: "core-multi-update",
	description: "Core multi-update tests: multi-plan cancel, uncancel, errors",
	tier: "core",
	paths: [
		// Main + add-on EOC/immediate cancels in one call (incl. consumable overage)
		"billing/multi-update/basic/multi-update-basic.test.ts",
		// Uncancel composed with cancel in one call (cancel_at collision case)
		"billing/multi-update/uncancel/multi-update-uncancel.test.ts",
		// Immediate + EOC mixed on one subscription
		"billing/multi-update/mixed-timing/multi-update-mixed-timing.test.ts",
		// Duplicate targets, atomicity, per-item validation
		"billing/multi-update/errors/multi-update-errors.test.ts",
	],
};
