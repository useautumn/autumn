import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	type ProductItem,
} from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemId } from "@/utils/product/productItemUtils";
import { getDefaultItem } from "../utils/getDefaultItem";

/** Get all feature IDs already in the plan, including underlying features from credit systems */
const getFeaturesAlreadyInPlan = ({
	items,
	features,
}: {
	items: ProductItem[];
	features: Feature[];
}): Set<string> => {
	const featureIds = new Set<string>();

	for (const item of items) {
		if (!item.feature_id) continue;

		featureIds.add(item.feature_id);

		// If this feature is a credit system, also add all its underlying metered features
		const feature = features.find((f) => f.id === item.feature_id);
		if (feature?.type === FeatureType.CreditSystem && feature.config?.schema) {
			for (const schemaItem of feature.config.schema as CreditSchemaItem[]) {
				if (schemaItem.metered_feature_id) {
					featureIds.add(schemaItem.metered_feature_id);
				}
			}
		}
	}

	return featureIds;
};

export function SelectFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const [selectOpen, setSelectOpen] = useState(false);

	const { features } = useFeaturesQuery();
	const { product, setProduct, initialProduct } = useProduct();
	const { setSheet } = useSheet();

	const nonArchivedFeatures = useMemo(
		() => features.filter((f: Feature) => !f.archived),
		[features],
	);

	useEffect(() => {
		const timer = setTimeout(() => setSelectOpen(true), 350);
		return () => clearTimeout(timer);
	}, []);

	const featuresInPlan = useMemo(
		() =>
			getFeaturesAlreadyInPlan({
				items: product?.items ?? [],
				features,
			}),
		[product?.items, features],
	);

	const handleFeatureSelect = (featureId: string) => {
		if (!featureId || !product) return;

		const selectedFeature = features.find((f) => f.id === featureId);
		if (!selectedFeature) return;

		// Check if this feature was previously configured in initialProduct
		const previousItem = initialProduct?.items?.find(
			(i) => i.feature_id === featureId,
		);

		// Use the previous configuration if available, otherwise create a new default item
		const newItem =
			previousItem ?? getDefaultItem({ feature: selectedFeature });

		// Add the new item to the product
		const newItems = [...product.items, newItem];
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Open edit sidebar for the new item
		const itemIndex = newItems.length - 1;
		const itemId = getItemId({ item: newItem, itemIndex });

		setSheet({ type: "edit-feature", itemId });
	};

	const handleCreateNew = () => {
		setSheet({ type: "new-feature", itemId: "new" });
	};

	return (
		<div className="flex flex-col h-full">
			{!isOnboarding && (
				<SheetHeader
					title="Select Feature"
					description="Add a feature that customers on this plan can access"
				/>
			)}

			<div className="flex-1 overflow-y-auto">
				<SheetSection withSeparator={false}>
					<FormLabel>Select a feature</FormLabel>
					<FeatureSearchDropdown
						features={nonArchivedFeatures}
						value={null}
						onSelect={handleFeatureSelect}
						open={selectOpen}
						onOpenChange={setSelectOpen}
						renderExtra={(feature) =>
							featuresInPlan.has(feature.id) ? (
								<span className="shrink-0 text-xs text-t3 bg-muted px-1 py-0 rounded-md">
									Already in plan
								</span>
							) : null
						}
						footer={
							<div className="border-t pt-2 pb-1 px-2">
								<Button
									variant="muted"
									className="w-full"
									onClick={handleCreateNew}
								>
									<PlusIcon className="size-[14px] text-t2" weight="regular" />
									Create new feature
								</Button>
							</div>
						}
					/>
				</SheetSection>
			</div>
		</div>
	);
}
