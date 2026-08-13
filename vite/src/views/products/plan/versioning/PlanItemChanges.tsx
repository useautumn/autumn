import type { Feature, FrontendProduct, ProductItem } from "@autumn/shared";
import { PlanItemsSection } from "@/components/forms/shared";

const EMPTY_OPTIONS = {};

export function PlanItemChanges({
	product,
	originalItems,
	features,
	currency,
}: {
	product: FrontendProduct;
	originalItems?: ProductItem[];
	features: Feature[];
	currency: string;
}) {
	return (
		<PlanItemsSection
			product={product}
			originalItems={originalItems}
			features={features}
			prepaidOptions={EMPTY_OPTIONS}
			initialPrepaidOptions={EMPTY_OPTIONS}
			showDiff
			changesOnly
			readOnly
			currency={currency}
			onEditPlan={() => {}}
			showPriceHeader={false}
			showEditButton={false}
		/>
	);
}
