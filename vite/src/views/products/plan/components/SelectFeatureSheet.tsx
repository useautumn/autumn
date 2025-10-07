import {
	type Feature,
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

		// Create a new item with the selected feature
		const newItem = {
			feature_id: selectedFeature.id,
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
						<SelectContent>
							{filteredFeatures.map((feature: Feature) => (
								<SelectItem key={feature.id} value={feature.id}>
									<div className="flex items-center gap-2">
										<div className="text-primary shrink-0">
											{getFeatureIcon({ feature })}
										</div>
										<span className="truncate">{feature.name}</span>
									</div>
								</SelectItem>
							))}
							<div className="border-t p-1">
								<button
									type="button"
									className="w-full px-[6px] py-[4px] rounded-[6px] bg-muted hover:bg-muted-hover transition-colors focus:outline-none text-sm font-medium flex items-center justify-center gap-[6px]"
									onClick={handleCreateNew}
								>
									<PlusIcon className="size-[14px]" weight="regular" />
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
