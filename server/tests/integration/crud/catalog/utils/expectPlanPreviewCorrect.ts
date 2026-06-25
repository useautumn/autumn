import { expect } from "bun:test";
import type {
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";

type ItemExpectation = { featureId: string; included?: number };

/**
 * Assert the per-plan slice of a catalog.preview_update response. Only the
 * fields you pass are checked, mirroring expectBalanceCorrect.
 */
export const expectPlanPreviewCorrect = ({
	preview,
	planId,
	willVersion,
	hasCustomers,
	hasMigrationDraft,
	items,
}: {
	preview: CatalogPreviewUpdateResponse;
	planId: string;
	willVersion?: boolean;
	hasCustomers?: boolean;
	hasMigrationDraft?: boolean;
	items?: ItemExpectation[];
}): CatalogPlanPreview => {
	const result = preview.plans.find((plan) => plan.plan.id === planId);
	expect(result, `No plan preview for ${planId}`).toBeDefined();
	const planPreview = result as CatalogPlanPreview;

	if (typeof willVersion !== "undefined") {
		expect(planPreview.will_version, `will_version for ${planId}`).toBe(
			willVersion,
		);
	}

	if (typeof hasCustomers !== "undefined") {
		expect(planPreview.has_customers, `has_customers for ${planId}`).toBe(
			hasCustomers,
		);
	}

	if (typeof hasMigrationDraft !== "undefined") {
		if (hasMigrationDraft) {
			expect(
				planPreview.migration_draft,
				`migration_draft for ${planId}`,
			).not.toBeNull();
			expect(
				planPreview.migration_draft?.operations.customer?.length ?? 0,
				`migration operations for ${planId}`,
			).toBeGreaterThan(0);
		} else {
			expect(
				planPreview.migration_draft,
				`migration_draft for ${planId}`,
			).toBeNull();
		}
	}

	if (items) {
		for (const expectedItem of items) {
			const item = planPreview.plan.items?.find(
				(candidate) => candidate.feature_id === expectedItem.featureId,
			);
			expect(item, `item ${expectedItem.featureId} on ${planId}`).toBeDefined();
			if (typeof expectedItem.included !== "undefined") {
				expect(item?.included, `included for ${expectedItem.featureId}`).toBe(
					expectedItem.included,
				);
			}
		}
	}

	return planPreview;
};
