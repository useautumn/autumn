import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { mergePreservedSchedulePhases } from "@/internal/billing/v2/actions/setPlans/subscriptionScope/mergePreservedSchedulePhases";

const NOW = 1_000;
const NEXT_MONTH = 2_000;
const LATER = 3_000;

describe(chalk.yellowBright("mergePreservedSchedulePhases"), () => {
	test("returns the new phases untouched when nothing is preserved", () => {
		const phases = [{ startsAt: NOW, customerProductIds: ["pro_a"] }];

		expect(
			mergePreservedSchedulePhases({
				phases,
				existingPhases: [
					{ startsAt: 0, customerProductIds: ["pro_a_old", "seats_b"] },
				],
				preservedCustomerProductIds: new Set(),
			}),
		).toBe(phases);
	});

	test("keeps another subscription's current plans in the new opening phase", () => {
		expect(
			mergePreservedSchedulePhases({
				phases: [
					{ startsAt: NOW, customerProductIds: ["premium_a"] },
					{ startsAt: LATER, customerProductIds: ["pro_a"] },
				],
				existingPhases: [
					{ startsAt: 0, customerProductIds: ["pro_a_old", "seats_b"] },
				],
				preservedCustomerProductIds: new Set(["seats_b"]),
			}),
		).toEqual([
			{ startsAt: NOW, customerProductIds: ["premium_a", "seats_b"] },
			{ startsAt: LATER, customerProductIds: ["pro_a", "seats_b"] },
		]);
	});

	test("keeps another subscription's future phase as its own boundary", () => {
		expect(
			mergePreservedSchedulePhases({
				phases: [{ startsAt: NOW, customerProductIds: ["premium_a"] }],
				existingPhases: [
					{ startsAt: 0, customerProductIds: ["seats_b"] },
					{ startsAt: NEXT_MONTH, customerProductIds: ["seats_b_annual"] },
				],
				preservedCustomerProductIds: new Set(["seats_b", "seats_b_annual"]),
			}),
		).toEqual([
			{ startsAt: NOW, customerProductIds: ["premium_a", "seats_b"] },
			{
				startsAt: NEXT_MONTH,
				customerProductIds: ["premium_a", "seats_b_annual"],
			},
		]);
	});
});
