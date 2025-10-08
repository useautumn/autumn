import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	ProductItemFeatureType,
	ProductItemInterval,
	productV2ToFeatureItems,
} from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemId } from "@/utils/product/productItemUtils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { useProductContext } from "../../product/ProductContext";

export function SelectFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const [selectedFeatureId, setSelectedFeatureId] = useState<string>("");
	const [selectOpen, setSelectOpen] = useState(true);

	const { features } = useFeaturesQuery();
	const { product, setProduct, setSheet, setEditingState } =
		useProductContext();

	const filteredFeatures = features.filter((f: Feature) => !f.archived);

	const handleAddFeature = () => {
		if (!selectedFeatureId || !product) return;

		const selectedFeature = features.find((f) => f.id === selectedFeatureId);
		if (!selectedFeature) return;

		// Determine feature_type based on feature.type and config.usage_type
		let featureType: ProductItemFeatureType;
		if (selectedFeature.type === FeatureType.Boolean) {
			featureType = ProductItemFeatureType.Static;
		} else if (selectedFeature.type === FeatureType.CreditSystem) {
			featureType = ProductItemFeatureType.SingleUse;
		} else if (selectedFeature.type === FeatureType.Metered) {
			const usageType = selectedFeature.config?.usage_type;
			if (usageType === FeatureUsageType.Continuous) {
				featureType = ProductItemFeatureType.ContinuousUse;
			} else {
				featureType = ProductItemFeatureType.SingleUse;
			}
		} else {
			// Fallback
			featureType = ProductItemFeatureType.SingleUse;
		}

		// Create a new item with the selected feature
		const newItem = {
			feature_id: selectedFeature.id,
			feature_type: featureType,
			included_usage: null,
			interval: ProductItemInterval.Month,
			price: null,
			tiers: null,
			billing_units: 1,
			entity_feature_id: null,
			reset_usage_when_enabled: true,
		};

		// Add the new item to the product
		const newItems = [...(product.items || []), newItem];
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Open edit sidebar for the new item
		const featureItems = productV2ToFeatureItems({ items: newItems });
		const itemIndex = featureItems.length - 1;
		const itemId = getItemId({ item: newItem, itemIndex });

		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");
	};

	const handleCreateNew = () => {
		setEditingState({ type: "feature", id: "new" });
		setSheet("new-feature");
	};

	return (
		<div className="flex flex-col h-full">
			{!isOnboarding && (
				<SheetHeader
					title="Select Feature"
					description="Choose a feature to add to this plan"
				/>
			)}

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Feature">
					<FormLabel>Select a feature</FormLabel>
					<Select
						value={selectedFeatureId}
						onValueChange={(value) => setSelectedFeatureId(value)}
						open={selectOpen}
						onOpenChange={setSelectOpen}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select a feature" />
						</SelectTrigger>
						<SelectContent className="max-h-80">
							<div className="max-h-60 overflow-y-auto">
								{filteredFeatures.map((feature: Feature) => (
									<SelectItem
										key={feature.id}
										value={feature.id}
										className="py-2 px-2.5"
									>
										<div className="flex items-center gap-2">
											<div className="text-primary shrink-0">
												{getFeatureIcon({ feature })}
											</div>
											<span className="truncate">{feature.name}</span>
										</div>
									</SelectItem>
								))}
							</div>
							<div className="border-t pt-2 pb-1 px-2.5 sticky bottom-0 bg-popover">
								<button
									type="button"
									className="w-full px-[6px] py-[4px] rounded-[6px] bg-muted hover:bg-muted-hover transition-colors focus:outline-none text-sm font-medium flex items-center justify-center gap-[6px] text-t2"
									onClick={handleCreateNew}
								>
									<PlusIcon className="size-[14px] text-t2" weight="regular" />
									Add new feature
								</button>
							</div>
						</SelectContent>
					</Select>
				</SheetSection>
			</div>

			<div className="mt-auto p-4">
				<Button
					className="w-full"
					onClick={handleAddFeature}
					disabled={!selectedFeatureId}
				>
					Add Feature
				</Button>
			</div>
		</div>
	);
}
