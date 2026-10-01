import { expect, test } from "bun:test";
import { planRowKey } from "@/components/forms/customer-state/utils/planRowKey";

test("the picker row keeps its key when its scope changes", () => {
	const pickerRow = { section: "plan-0", planIndex: 2, productId: "" };

	expect(planRowKey(pickerRow)).toBe("plan-0-2-");
});

test("a row remounts when its plan changes", () => {
	const before = planRowKey({ section: "plan-0", planIndex: 2, productId: "" });
	const after = planRowKey({
		section: "plan-0",
		planIndex: 2,
		productId: "pro",
	});

	expect(after).not.toBe(before);
});
