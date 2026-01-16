import { expect } from "bun:test";
import { type BillingPreviewResponse, formatMs } from "@autumn/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verify a billing preview's next_cycle field has the expected values.
 * Used to check when trial ends and what charge will be.
 *
 * @param startsAt - Expected starts_at as absolute Unix timestamp (ms).
 *                   Use `advancedTo + ms.days(X)` for test clock scenarios.
 */
export const expectPreviewNextCycleCorrect = ({
	preview,
	expectDefined = true,
	startsAt,
	total,
	toleranceMs = ONE_DAY_MS,
}: {
	preview: BillingPreviewResponse;
	/** Whether next_cycle should be defined (default: true) */
	expectDefined?: boolean;
	/** Expected starts_at as absolute Unix timestamp (ms) */
	startsAt?: number;
	/** Expected total amount (in dollars) */
	total?: number;
	/** Tolerance in ms (default: 1 day) */
	toleranceMs?: number;
}) => {
	if (!expectDefined) {
		expect(
			preview.next_cycle,
			"Preview next_cycle should not be defined",
		).toBeUndefined();
		return;
	}

	expect(
		preview.next_cycle,
		"Preview next_cycle should be defined",
	).toBeDefined();

	const nextCycle = preview.next_cycle!;

	if (startsAt !== undefined) {
		const diff = Math.abs(nextCycle.starts_at - startsAt);

		expect(
			diff < toleranceMs,
			`Preview next_cycle.starts_at (${formatMs(nextCycle.starts_at)}) should be within ${toleranceMs}ms of ${formatMs(startsAt)}, but diff is ${diff}ms`,
		).toBe(true);
	}

	if (total !== undefined) {
		expect(
			nextCycle.total,
			`Preview next_cycle.total should be ${total}`,
		).toEqual(total);
	}

	return nextCycle;
};
