import { describe, expect, test } from "bun:test";
import type { UpdatePlanOp } from "@autumn/shared";
import { getPlanVersionActionLabel } from "@/views/migrations/migration/operations/UpdatePlanOpForm";

const op = (patch: Partial<UpdatePlanOp>): UpdatePlanOp => ({
	type: "update_plan",
	plan_filter: {},
	...patch,
});

describe("UpdatePlanOpForm", () => {
	test("labels same-version version operations as reset", () => {
		expect(
			getPlanVersionActionLabel(
				op({ plan_filter: { version: 2 }, version: 2 }),
			),
		).toBe("Reset to Plan Version");
	});

	test("keeps set label when operation version differs from filter version", () => {
		expect(
			getPlanVersionActionLabel(
				op({ plan_filter: { version: 1 }, version: 2 }),
			),
		).toBe("Set Plan Version");
	});

	test("uses the menu default version before a version is selected", () => {
		expect(getPlanVersionActionLabel(op({ plan_filter: { version: 1 } }))).toBe(
			"Reset to Plan Version",
		);
	});
});
