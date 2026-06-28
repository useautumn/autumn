type VariantPreview = {
	conflicts?: unknown[];
	customize?: unknown;
	item_changes?: unknown[];
	price_change?: unknown;
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
	return (planChange.variants ?? []).filter(
		variantPreviewHasChanges,
	) as NonNullable<TPlanChange["variants"]>;
};
