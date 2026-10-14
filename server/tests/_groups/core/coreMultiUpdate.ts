import type { TestGroup } from "../types";

export const coreMultiUpdate: TestGroup = {
	name: "core-multi-update",
	description: "Core multi-update tests: multi-plan cancel, uncancel, errors",
	tier: "core",
	paths: [
		"billing/multi-update/basic/multi-update-basic-survivors.test.ts",
		"billing/multi-update/basic/multi-update-basic-cancel-all.test.ts",
		"billing/multi-update/uncancel/multi-update-uncancel.test.ts",
		"billing/multi-update/mixed-timing/multi-update-mixed-timing.test.ts",
		"billing/multi-update/errors/multi-update-errors.test.ts",
	],
};
