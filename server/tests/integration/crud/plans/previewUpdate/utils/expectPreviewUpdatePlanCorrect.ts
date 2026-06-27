import { expect } from "bun:test";
import type { PlanUpdatePreview } from "@autumn/shared";

type ExpectedPlanUpdatePreview = Partial<
	Omit<PlanUpdatePreview, "item_changes" | "plan" | "price_change" | "variants">
> & {
	plan?: Partial<NonNullable<PlanUpdatePreview["plan"]>>;
	price_change?: PriceChangeExpectation;
	variants?: unknown[];
	item_changes?: ItemChangeExpectation[];
};

type PriceChangeExpectation = {
	previous?: Record<string, unknown> | null;
	current?: Record<string, unknown> | null;
};

type ItemChangeExpectation = Partial<
	Omit<PlanUpdatePreview["item_changes"][number], "item">
> & {
	item?: Record<string, unknown>;
};

export const expectPreviewUpdatePlanCorrect = (params: {
	preview: PlanUpdatePreview;
	expected: ExpectedPlanUpdatePreview;
	logPreview?: boolean;
}) => {
	const { preview, expected, logPreview = true } = params;

	if (logPreview) {
		console.log(
			"plans.preview_update response",
			JSON.stringify(preview, null, 2),
		);
	}

	if (expected.plan_id !== undefined) {
		expect(preview.plan_id).toBe(expected.plan_id);
	}

	if ("plan" in expected) {
		if (expected.plan === undefined) {
			expect(preview.plan).toBeUndefined();
		} else {
			expect(preview.plan).toMatchObject(expected.plan);
		}
	}

	if (expected.has_customers !== undefined) {
		expect(preview.has_customers).toBe(expected.has_customers);
	}

	if ("customize" in expected) {
		if (expected.customize === null) {
			expect(preview.customize).toBeNull();
		} else {
			expect(preview.customize).toMatchObject(expected.customize ?? {});
		}
	}

	if ("previous_attributes" in expected) {
		if (expected.previous_attributes === null) {
			expect(preview.previous_attributes).toBeNull();
		} else {
			expect(preview.previous_attributes).toMatchObject(
				expected.previous_attributes ?? {},
			);
		}
	}

	if ("price_change" in expected) {
		if (expected.price_change === undefined) {
			expect(preview.price_change).toBeUndefined();
		} else {
			expect(preview.price_change).toMatchObject(expected.price_change);
		}
	}

	if (expected.variants !== undefined) {
		expect(preview.variants).toHaveLength(expected.variants.length);
		for (const [index, expectedVariant] of expected.variants.entries()) {
			expect(preview.variants[index]).toMatchObject(
				expectedVariant as Record<string, unknown>,
			);
		}
	}

	if ("item_changes" in expected) {
		const itemChanges = expected.item_changes ?? [];
		expect(preview.item_changes).toHaveLength(itemChanges.length);
		for (const [index, expectedChange] of itemChanges.entries()) {
			expect(preview.item_changes[index]).toMatchObject(expectedChange);
		}
	}

	return preview;
};
