import { expect } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";

/**
 * API-side processors asserts via catalogV2.get.
 * Omit a field to skip. Pass `null` on `stripe` / a price slot to assert omitted.
 */
export const expectApiPlanProcessorsCorrect = ({
	plan,
	stripe,
	basePriceId,
	items,
}: {
	plan: ApiPlanV1;
	stripe?: { product_id: string } | null;
	basePriceId?: string | null;
	items?: Record<string, string | null>;
}) => {
	if (stripe === null) {
		expect(plan.processors, "plan processors omitted").toBeUndefined();
	} else if (stripe !== undefined) {
		expect(plan.processors?.stripe?.product_id, "plan product_id").toBe(
			stripe.product_id,
		);
	}

	if (basePriceId === null) {
		expect(plan.price?.processors, "base processors omitted").toBeUndefined();
	} else if (basePriceId !== undefined) {
		expect(
			plan.price?.processors?.stripe?.price_id,
			"base price_id",
		).toBe(basePriceId);
	}

	if (items === undefined) return;
	for (const [featureId, expectedPriceId] of Object.entries(items)) {
		const item = plan.items.find(
			(candidate) => candidate.feature_id === featureId,
		);
		expect(item, `missing item ${featureId}`).toBeDefined();
		if (expectedPriceId === null) {
			expect(
				item?.price?.processors,
				`${featureId} processors omitted`,
			).toBeUndefined();
			continue;
		}
		expect(
			item?.price?.processors?.stripe?.price_id,
			`${featureId} price_id`,
		).toBe(expectedPriceId);
	}
};
