import { expect } from "bun:test";
import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { PreviewUpdateCatalogResponseSchema } from "@autumn/shared";

type PlanPreviewRow = PreviewUpdateCatalogResponse["plans"][number];
type PlanPreviewChange = NonNullable<PlanPreviewRow["plan_change"]>;
type PlanPreviewVersioning = NonNullable<PlanPreviewRow["versioning"]>;

type ExpectedPlanPreviewRow = {
	planId: string;
	/** Disambiguate when all_versions emits one preview row per version. */
	currentVersion?: number;
	action?: PlanPreviewRow["action"];
	name?: string;
	hasCustomers?: boolean;
	willArchive?: boolean;
	/** Exact match; pass `null` to assert stubbed/absent versioning. */
	versioning?: PlanPreviewVersioning | null;
	/** Exact match; pass `null` to assert plan_change is absent (undefined or null). */
	planChange?: PlanPreviewChange | null;
	/** Containment over plan_change.previous_attributes keys/values. */
	previousAttributes?: Record<string, unknown> | null;
	/** Containment over customize lanes; pass `null` to assert absent. */
	customize?: PlanPreviewChange["customize"] | null;
	priceChange?: PlanPreviewChange["price_change"] | null;
	freeTrialChange?: PlanPreviewChange["free_trial_change"] | null;
	itemChanges?: PlanPreviewChange["item_changes"];
};

const expectAbsent = (value: unknown) => {
	expect(value == null).toBe(true);
};

const expectPresent = (value: unknown) => {
	expect(value != null).toBe(true);
};

/** Parse + schema-validate the preview response; throws on shape drift. */
export const parsePlanPreview = (raw: unknown): PreviewUpdateCatalogResponse =>
	PreviewUpdateCatalogResponseSchema.parse(raw);

export const findPlanPreviewRow = ({
	preview,
	planId,
	currentVersion,
}: {
	preview: PreviewUpdateCatalogResponse;
	planId: string;
	currentVersion?: number;
}): PlanPreviewRow => {
	const row = preview.plans.find(
		(candidate) =>
			candidate.plan_id === planId &&
			(currentVersion === undefined ||
				candidate.versioning?.current_version === currentVersion),
	);
	const label =
		currentVersion === undefined
			? planId
			: `${planId} v${currentVersion}`;
	expect(row, `missing preview row for plan ${label}`).toBeDefined();
	if (!row) throw new Error(`missing preview row for plan ${label}`);
	return row;
};

/** Containment asserts for one plan preview row — only fields passed are checked. */
export const expectPlanPreviewRowCorrect = ({
	preview,
	expected,
}: {
	preview: PreviewUpdateCatalogResponse;
	expected: ExpectedPlanPreviewRow;
}) => {
	const row = findPlanPreviewRow({
		preview,
		planId: expected.planId,
		currentVersion: expected.currentVersion,
	});

	if (expected.action !== undefined) {
		expect(row.action).toBe(expected.action);
	}
	if (expected.name !== undefined) {
		expect(row.name).toBe(expected.name);
	}
	if (expected.hasCustomers !== undefined) {
		expect(row.state.has_customers).toBe(expected.hasCustomers);
	}
	if (expected.willArchive !== undefined) {
		expect(row.state.will_archive).toBe(expected.willArchive);
	}
	if (expected.versioning !== undefined) {
		expect(row.versioning).toEqual(expected.versioning);
	}
	if (expected.planChange !== undefined) {
		if (expected.planChange === null) {
			expectAbsent(row.plan_change);
		} else {
			expect(row.plan_change).toEqual(expected.planChange);
		}
	}
	if (expected.previousAttributes !== undefined) {
		if (expected.previousAttributes === null) {
			expectAbsent(row.plan_change?.previous_attributes);
		} else {
			expectPresent(row.plan_change);
			expect(row.plan_change?.previous_attributes).toMatchObject(
				expected.previousAttributes,
			);
			for (const key of Object.keys(
				row.plan_change?.previous_attributes ?? {},
			)) {
				expect(
					Object.keys(expected.previousAttributes),
					`unexpected previous_attributes key ${key}`,
				).toContain(key);
			}
		}
	}
	if (expected.customize !== undefined) {
		if (expected.customize === null) {
			expectAbsent(row.plan_change?.customize);
		} else {
			expect(row.plan_change?.customize).toMatchObject(expected.customize);
		}
	}
	if (expected.priceChange !== undefined) {
		if (expected.priceChange === null) {
			expectAbsent(row.plan_change?.price_change);
		} else {
			expect(row.plan_change?.price_change).toMatchObject(expected.priceChange);
		}
	}
	if (expected.freeTrialChange !== undefined) {
		if (expected.freeTrialChange === null) {
			expectAbsent(row.plan_change?.free_trial_change);
		} else {
			expect(row.plan_change?.free_trial_change).toMatchObject(
				expected.freeTrialChange,
			);
		}
	}
	if (expected.itemChanges !== undefined) {
		expect(row.plan_change?.item_changes ?? []).toEqual(expected.itemChanges);
	}
};

export const expectPlanPreviewRowsCorrect = ({
	preview,
	expected,
}: {
	preview: PreviewUpdateCatalogResponse;
	expected: ExpectedPlanPreviewRow[];
}) => {
	for (const row of expected) {
		expectPlanPreviewRowCorrect({ preview, expected: row });
	}
};
