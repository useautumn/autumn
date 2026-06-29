import { expect } from "bun:test";
import type { PlanUpdatePreview } from "@autumn/shared";

export const expectPreviewVariantsCorrect = ({
	preview,
	variants,
}: {
	preview: PlanUpdatePreview;
	variants: Array<Partial<PlanUpdatePreview["variants"][number]> & { plan_id: string }>;
}) => {
	expect(preview.variants).toHaveLength(variants.length);

	for (const expected of variants) {
		const actual = preview.variants.find(
			(variant) => variant.plan_id === expected.plan_id,
		);

		expect(actual).toBeDefined();
		expect(actual).toMatchObject(expected);
	}
};

export const expectPreviewItemChangeCorrect = ({
	preview,
	action,
	featureId,
	item,
}: {
	preview: PlanUpdatePreview;
	action: PlanUpdatePreview["item_changes"][number]["action"];
	featureId: string;
	item?: Record<string, unknown>;
}) => {
	const actual = preview.item_changes.find(
		(change) =>
			change.action === action && change.feature_id === featureId,
	);

	expect(actual).toBeDefined();
	if (item !== undefined) {
		expect(actual?.item).toMatchObject(item);
	}
};
