type VariantPreview = {
	conflicts?: unknown[];
	customize?: unknown;
	has_customers?: boolean;
	item_changes?: unknown[];
	name?: string;
	plan_id?: string;
	price_change?: unknown;
	update_source?: "direct" | "propagated" | null;
	version?: number;
	versionable?: boolean;
	will_apply?: boolean;
};

type SelectableVariantPreview = VariantPreview & {
	name: string;
	plan_id: string;
	versionable: boolean;
};

type PlanChangeWithVariants = {
	variants?: VariantPreview[];
};

const isSelectableVariantPreview = (
	variant: VariantPreview,
): variant is SelectableVariantPreview =>
	Boolean(variant.plan_id && variant.name && variant.versionable !== undefined);

export const getDirectVariantUpdatePreviews = ({
	planChange,
}: {
	planChange: PlanChangeWithVariants;
}): SelectableVariantPreview[] =>
	(planChange.variants ?? []).filter(
		(variant) =>
			isSelectableVariantPreview(variant) &&
			variant.will_apply &&
			variant.update_source === "direct",
	) as SelectableVariantPreview[];

export const getVariantPropagationPreviews = ({
	planChange,
}: {
	planChange: PlanChangeWithVariants;
}): SelectableVariantPreview[] => {
	const changedVariants = (planChange.variants ?? []).filter(
		(variant) =>
			isSelectableVariantPreview(variant) &&
			variant.update_source === "propagated",
	) as SelectableVariantPreview[];
	const latestByPlanId = new Map<string, SelectableVariantPreview>();

	for (const variant of changedVariants) {
		const existing = latestByPlanId.get(variant.plan_id);
		if (!existing || (variant.version ?? 0) > (existing.version ?? 0)) {
			latestByPlanId.set(variant.plan_id, variant);
		}
	}

	return [...latestByPlanId.values()];
};
