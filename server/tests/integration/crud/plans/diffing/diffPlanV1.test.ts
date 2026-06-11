import { type ApiPlanV1, BillingInterval } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { popflyStart, popflyStartAnnual } from "./diffPlanV1.fixtures.js";

describe("diffPlanV1 — popfly start vs start_annual", () => {
	test("start → start_annual: only price diffs (annual price)", () => {
		const diff = diffPlanV1({ from: popflyStart, to: popflyStartAnnual });

		expect(diff.price).toEqual({ amount: 5988, interval: BillingInterval.Year });
		expect(diff.add_items).toBeUndefined();
		expect(diff.remove_items).toBeUndefined();
		expect(diff.free_trial).toBeUndefined();
	});

	test("start → start: empty diff (no fields set)", () => {
		const diff = diffPlanV1({ from: popflyStart, to: popflyStart });

		expect(diff).toEqual({});
	});

	test("start_annual → start (reverse): price is the monthly price", () => {
		const diff = diffPlanV1({ from: popflyStartAnnual, to: popflyStart });

		expect(diff.price).toEqual({ amount: 499, interval: BillingInterval.Month });
		expect(diff.add_items).toBeUndefined();
		expect(diff.remove_items).toBeUndefined();
		expect(diff.free_trial).toBeUndefined();
	});

	test("modify-in-place: same feature_id with different included → remove + add", () => {
		const modified: ApiPlanV1 = {
			...popflyStart,
			items: popflyStart.items.map((item) =>
				item.feature_id === "social_listening_terms"
					? { ...item, included: 999 }
					: item,
			),
		};

		const diff = diffPlanV1({ from: popflyStart, to: modified });

		expect(diff.remove_items).toEqual([
			{ feature_id: "social_listening_terms" },
		]);
		expect(diff.add_items).toHaveLength(1);
		expect(diff.add_items?.[0]).toMatchObject({
			feature_id: "social_listening_terms",
			included: 999,
		});
		expect(diff.price).toBeUndefined();
	});
});
