import { expect } from "bun:test";
import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { PreviewUpdateCatalogResponseSchema } from "@autumn/shared";

type PlanPreviewRow = PreviewUpdateCatalogResponse["plans"][number];
type PlanPreviewChanges = NonNullable<PlanPreviewRow["changes"]>;
type PlanPreviewVersioning = NonNullable<PlanPreviewRow["versioning"]>;

type ExpectedPlanPreviewRow = {
	planId: string;
	action?: PlanPreviewRow["action"];
	name?: string;
	hasCustomers?: boolean;
	willArchive?: boolean;
	/** Exact match; pass `null` to assert stubbed/absent versioning. */
	versioning?: PlanPreviewVersioning | null;
	/** Exact match; pass `null` to assert stubbed/absent changes. */
	changes?: PlanPreviewChanges | null;
	/** Containment over changes.previous_attributes keys/values. */
	previousAttributes?: Record<string, unknown> | null;
	/** Containment over customize lanes. */
	customize?: PlanPreviewChanges["customize"];
	priceChange?: PlanPreviewChanges["price_change"] | null;
	itemChanges?: PlanPreviewChanges["item_changes"];
};

/** Parse + schema-validate the preview response; throws on shape drift. */
export const parsePlanPreview = (raw: unknown): PreviewUpdateCatalogResponse =>
	PreviewUpdateCatalogResponseSchema.parse(raw);

export const findPlanPreviewRow = ({
	preview,
	planId,
}: {
	preview: PreviewUpdateCatalogResponse;
	planId: string;
}): PlanPreviewRow => {
	const row = preview.plans.find((candidate) => candidate.plan_id === planId);
	expect(row, `missing preview row for plan ${planId}`).toBeDefined();
	if (!row) throw new Error(`missing preview row for plan ${planId}`);
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
	const row = findPlanPreviewRow({ preview, planId: expected.planId });

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
	if (expected.changes !== undefined) {
		expect(row.changes).toEqual(expected.changes);
	}
	if (expected.previousAttributes !== undefined) {
		if (expected.previousAttributes === null) {
			expect(row.changes?.previous_attributes ?? null).toBeNull();
		} else {
			expect(row.changes).not.toBeNull();
			expect(row.changes?.previous_attributes).toMatchObject(
				expected.previousAttributes,
			);
			for (const key of Object.keys(row.changes?.previous_attributes ?? {})) {
				expect(
					Object.keys(expected.previousAttributes),
					`unexpected previous_attributes key ${key}`,
				).toContain(key);
			}
		}
	}
	if (expected.customize !== undefined) {
		if (expected.customize === null) {
			expect(row.changes?.customize ?? null).toBeNull();
		} else {
			expect(row.changes?.customize).toMatchObject(expected.customize);
		}
	}
	if (expected.priceChange !== undefined) {
		if (expected.priceChange === null) {
			expect(row.changes?.price_change).toBeUndefined();
		} else {
			expect(row.changes?.price_change).toEqual(expected.priceChange);
		}
	}
	if (expected.itemChanges !== undefined) {
		expect(row.changes?.item_changes ?? []).toEqual(expected.itemChanges);
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
