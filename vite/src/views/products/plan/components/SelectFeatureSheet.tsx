import { type Feature, productV2ToFeatureItems } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
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
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { getDefaultItem } from "../utils/getDefaultItem";

export function SelectFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const [selectOpen, setSelectOpen] = useState(true);

	const { features } = useFeaturesQuery();
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const setSheet = useSheetStore((s) => s.setSheet);

	const filteredFeatures = features.filter((f: Feature) => !f.archived);

	const handleFeatureSelect = (featureId: string) => {
		if (!featureId || !product) return;

		const selectedFeature = features.find((f) => f.id === featureId);
		if (!selectedFeature) return;

		// Create a new item with the selected feature
		const newItem = getDefaultItem({ feature: selectedFeature });

		// Add the new item to the product
		const newItems = [...(product.items || []), newItem];
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		// Open edit sidebar for the new item
		const featureItems = productV2ToFeatureItems({ items: newItems });
		const itemIndex = featureItems.length - 1;
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
					description="Choose a feature to add to this product"
				/>
			)}

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Feature" withSeparator={false}>
					<FormLabel>Select a feature</FormLabel>
					<Select
						onValueChange={handleFeatureSelect}
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
		</div>
	);
}
