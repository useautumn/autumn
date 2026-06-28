type VariantPreview = {
	conflicts?: unknown[];
	customize?: unknown;
	item_changes?: unknown[];
	plan_id?: string;
	price_change?: unknown;
	version?: number;
};

type PlanChangeWithVariants = {
	customize?: unknown;
	variants?: VariantPreview[];
};

const variantPreviewHasChanges = (variant: VariantPreview) =>
	Boolean(
		variant.customize ||
			variant.price_change ||
			(variant.item_changes?.length ?? 0) > 0 ||
			(variant.conflicts?.length ?? 0) > 0,
	);

export const getVariantPropagationPreviews = <
	TPlanChange extends PlanChangeWithVariants,
>({
	planChange,
}: {
	planChange: TPlanChange;
}): NonNullable<TPlanChange["variants"]> => {
	if (!planChange.customize) return [];
	const changedVariants = (planChange.variants ?? []).filter(
		variantPreviewHasChanges,
	);
	const withoutPlanId: VariantPreview[] = [];
	const latestByPlanId = new Map<string, VariantPreview>();

	for (const variant of changedVariants) {
		if (!variant.plan_id) {
			withoutPlanId.push(variant);
			continue;
		}

		const existing = latestByPlanId.get(variant.plan_id);
		if (!existing || (variant.version ?? 0) > (existing.version ?? 0)) {
			latestByPlanId.set(variant.plan_id, variant);
		}
	}

	return [
		...withoutPlanId,
		...latestByPlanId.values(),
	] as NonNullable<TPlanChange["variants"]>;
};
