import { expect } from "bun:test";
import type {
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";

type ItemExpectation = { featureId: string; included?: number };
type PlanChangeExpectation = {
	planId: string;
	willVersion?: boolean;
	hasCustomers?: boolean;
	willArchive?: boolean;
	planExpanded?: boolean;
	items?: ItemExpectation[];
};

const formatItem = (item: Record<string, any>) => {
	const parts = [item.feature_id ?? "unknown"];

	if (typeof item.included !== "undefined") {
		parts.push(`inc=${item.included}`);
	}
	if (item.unlimited) {
		parts.push("unlimited");
	}
	if (item.reset?.interval) {
		parts.push(`reset=${item.reset.interval}`);
	}
	if (item.price) {
		const interval = item.price.interval ? `/${item.price.interval}` : "";
		parts.push(`price=${item.price.amount}${interval}`);
	}

	return parts.join(" ");
};

const formatItemChange = (change: {
	action: string;
	item: Record<string, any>;
}) => `${change.action}:${formatItem(change.item)}`;

const formatCustomize = (customize: any) => {
	if (!customize) {
		return [];
	}

	const addItems = customize.add_items?.map((item: Record<string, any>) =>
		`+${formatItem(item)}`,
	);
	const removeItems = customize.remove_items?.map((item: Record<string, any>) =>
		`-${item.feature_id ?? "unknown"}${item.interval ? `/${item.interval}` : ""}`,
	);

	return [...(addItems ?? []), ...(removeItems ?? [])];
};

const formatCatalogPreview = (preview: CatalogPreviewUpdateResponse) => ({
	plan_changes: preview.plan_changes.map((planChanges) => {
		const summary: Record<string, unknown> = {
			id: planChanges.plan_id,
			expanded: Boolean(planChanges.plan),
			customers: planChanges.has_customers,
			versions: planChanges.versionable,
			archive: planChanges.will_archive,
			customize: formatCustomize(planChanges.customize),
			items: planChanges.item_changes.map(formatItemChange),
		};

		if (planChanges.previous_attributes) {
			summary.previous = planChanges.previous_attributes;
		}
		if (planChanges.price_change) {
			summary.price = planChanges.price_change;
		}
		if (planChanges.variants.length) {
			summary.variants = planChanges.variants.map((variant) => ({
				id: variant.plan_id,
				customers: variant.has_customers,
				versions: variant.versionable,
				conflicts: variant.conflicts.length,
				items: variant.item_changes.map(formatItemChange),
			}));
		}

		return summary;
	}),
	feature_changes: preview.feature_changes.map((featureChanges) => ({
		id: featureChanges.feature_id,
		action: featureChanges.action,
		archive: featureChanges.will_archive,
		blocked: featureChanges.blocked,
		reason: featureChanges.blocked_reason,
		expanded: Object.prototype.hasOwnProperty.call(featureChanges, "feature"),
	})),
});

export const expectCatalogPreview = ({
	preview,
	planChanges,
	logPreview = true,
}: {
	preview: CatalogPreviewUpdateResponse;
	planChanges: PlanChangeExpectation[];
	logPreview?: boolean;
}): CatalogPlanPreview[] => {
	if (logPreview) {
		console.log(
			"catalog.preview_update",
			JSON.stringify(formatCatalogPreview(preview), null, 2),
		);
	}

	return planChanges.map((expectedPlanChange) => {
		const { planId, willVersion, hasCustomers, willArchive, planExpanded, items } =
			expectedPlanChange;
		const result = preview.plan_changes.find(
			(planChanges) =>
				planChanges.plan_id === planId || planChanges.plan?.id === planId,
		);
		expect(result, `No plan preview for ${planId}`).toBeDefined();
		const planChanges = result as CatalogPlanPreview;

		if (typeof willVersion !== "undefined") {
			expect(planChanges.versionable, `versionable for ${planId}`).toBe(
				willVersion,
			);
		}

		if (typeof hasCustomers !== "undefined") {
			expect(planChanges.has_customers, `has_customers for ${planId}`).toBe(
				hasCustomers,
			);
		}

		if (typeof willArchive !== "undefined") {
			expect(planChanges.will_archive, `will_archive for ${planId}`).toBe(
				willArchive,
			);
		}

		if (typeof planExpanded !== "undefined") {
			expect(Boolean(planChanges.plan), `plan expanded for ${planId}`).toBe(
				planExpanded,
			);
		}

		if (items) {
			expect(
				planChanges.plan,
				`plan_changes.plan must be expanded to assert items for ${planId}`,
			).toBeDefined();
			for (const expectedItem of items) {
				const item = planChanges.plan?.items?.find(
					(candidate) => candidate.feature_id === expectedItem.featureId,
				);
				expect(
					item,
					`item ${expectedItem.featureId} on ${planId}`,
				).toBeDefined();
				if (typeof expectedItem.included !== "undefined") {
					expect(
						item?.included,
						`included for ${expectedItem.featureId}`,
					).toBe(expectedItem.included);
				}
			}
		}

		return planChanges;
	});
};
