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
	plans: preview.plans.map(({ plan_id, plan_changes }) => {
		const summary: Record<string, unknown> = {
			id: plan_id,
			expanded: Boolean(plan_changes.plan),
			customers: plan_changes.has_customers,
			versions: plan_changes.versionable,
			customize: formatCustomize(plan_changes.customize),
			items: plan_changes.item_changes.map(formatItemChange),
		};

		if (plan_changes.previous_attributes) {
			summary.previous = plan_changes.previous_attributes;
		}
		if (plan_changes.price_change) {
			summary.price = plan_changes.price_change;
		}
		if (plan_changes.variants.length) {
			summary.variants = plan_changes.variants.map((variant) => ({
				id: variant.plan_id,
				customers: variant.has_customers,
				versions: variant.versionable,
				conflicts: variant.conflicts.length,
				items: variant.item_changes.map(formatItemChange),
			}));
		}

		return summary;
	}),
	features: preview.features.map(({ feature, blockers }) => ({
		id: feature.id,
		type: feature.type,
		blockers: blockers.map((blocker) => `${blocker.field}:${blocker.code}`),
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
		const { planId, willVersion, hasCustomers, planExpanded, items } =
			expectedPlanChange;
		const result = preview.plans.find(
			(plan) =>
				plan.plan_id === planId || plan.plan_changes.plan?.id === planId,
		);
		expect(result, `No plan preview for ${planId}`).toBeDefined();
		const planPreview = result as CatalogPlanPreview;
		const planChanges = planPreview.plan_changes;

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

		return planPreview;
	});
};
