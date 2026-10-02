import { describe, expect, test } from "bun:test";
import { CusProductStatus, ms } from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { alignPhasesToSavedBoundaries } from "@/internal/billing/v2/actions/setPlans/setup/alignPhasesToSavedBoundaries";

const NOW = 1_800_000_000_000;
const BOUNDARY = NOW + ms.days(30);

const scheduledAtBoundary = customerProducts.create({
	id: "cus_prod_scheduled",
	status: CusProductStatus.Scheduled,
	startsAt: BOUNDARY,
});

const alignedStarts = (startsAt: number[]) =>
	alignPhasesToSavedBoundaries({
		phases: [
			{ starts_at: "now" as const },
			...startsAt.map((start) => ({ starts_at: start })),
		],
		customerProducts: [scheduledAtBoundary],
		currentEpochMs: NOW,
	}).map(({ starts_at }) => starts_at);

describe(chalk.yellowBright("alignPhasesToSavedBoundaries"), () => {
	test("snaps a phase near a saved boundary onto it", () => {
		expect(alignedStarts([BOUNDARY + ms.minutes(10)])).toEqual([
			"now",
			BOUNDARY,
		]);
	});

	test("never snaps two phases onto the same boundary", () => {
		expect(
			alignedStarts([BOUNDARY + ms.minutes(10), BOUNDARY + ms.minutes(20)]),
		).toEqual(["now", BOUNDARY, BOUNDARY + ms.minutes(20)]);
	});

	test("never snaps a phase past the phase after it", () => {
		expect(
			alignedStarts([BOUNDARY - ms.minutes(20), BOUNDARY - ms.minutes(10)]),
		).toEqual(["now", BOUNDARY - ms.minutes(20), BOUNDARY]);
	});
});
