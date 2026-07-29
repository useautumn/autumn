import { expect } from "bun:test";
import type {
	MultiUpdateParamsV0Input,
	MultiUpdatePreviewResponseV0,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli";

const DEFAULT_STARTS_AT_TOLERANCE_MS = 5 * 60 * 1000;

export type ExpectedSubscriptionPreview = {
	/** Matched against the entry's plan_ids as a set. */
	planIds: string[];
	/** EXACT amount due today for this subscription group. */
	total: number;
	/** EXACT next_cycle.total; null asserts no next cycle for this group. */
	nextCycleTotal: number | null;
	/** Expected next_cycle.starts_at, within toleranceMs. */
	nextCycleStartsAt?: number;
	nextCycleStartsAtToleranceMs?: number;
};

/**
 * Previews a multiUpdate and pins EXACT totals: the combined total plus, when
 * given, one core preview per subscription group (matched by plan_ids set).
 */
export const expectMultiUpdatePreviewCorrect = async ({
	autumn,
	params,
	total,
	subscriptions,
}: {
	autumn: AutumnInt;
	params: MultiUpdateParamsV0Input;
	total: number;
	subscriptions?: ExpectedSubscriptionPreview[];
}): Promise<MultiUpdatePreviewResponseV0> => {
	const preview =
		(await autumn.billing.previewMultiUpdate<MultiUpdateParamsV0Input>(
			params,
		)) as MultiUpdatePreviewResponseV0;

	expect(preview.total, "preview.total").toBe(total);

	if (!subscriptions) return preview;

	expect(
		preview.subscriptions?.length ?? 0,
		"number of subscription previews",
	).toBe(subscriptions.length);

	for (const expected of subscriptions) {
		const label = `subscription preview [${expected.planIds.join(", ")}]`;
		const match = preview.subscriptions.find(
			(subscription) =>
				[...subscription.plan_ids].sort().join("|") ===
				[...expected.planIds].sort().join("|"),
		);
		expect(match, label).toBeDefined();
		if (!match) continue;

		expect(match.total, `${label} total`).toBe(expected.total);

		if (expected.nextCycleTotal === null) {
			expect(match.next_cycle ?? null, `${label} next_cycle`).toBeNull();
		} else {
			expect(match.next_cycle, `${label} next_cycle`).toBeDefined();
			expect(match.next_cycle?.total, `${label} next_cycle.total`).toBe(
				expected.nextCycleTotal,
			);
		}

		if (expected.nextCycleStartsAt !== undefined) {
			const tolerance =
				expected.nextCycleStartsAtToleranceMs ?? DEFAULT_STARTS_AT_TOLERANCE_MS;
			expect(
				match.next_cycle?.starts_at,
				`${label} next_cycle.starts_at`,
			).toBeWithin(
				expected.nextCycleStartsAt - tolerance,
				expected.nextCycleStartsAt + tolerance,
			);
		}
	}

	return preview;
};
