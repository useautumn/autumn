import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	type ProductItem,
} from "@autumn/shared";
import {
	CaretDownIcon,
	MagnifyingGlassIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
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
	const [searchValue, setSearchValue] = useState("");

	const { features } = useFeaturesQuery();
	const { product, setProduct, initialProduct } = useProduct();
	const { setSheet } = useSheet();

	useEffect(() => {
		// Always delay to let sheet animate in (300ms animation + buffer)
		const timer = setTimeout(() => setSelectOpen(true), 350);
		return () => clearTimeout(timer);
	}, []);

	// Reset search when dropdown closes
	useEffect(() => {
		if (!selectOpen) {
			setSearchValue("");
		}
	}, [selectOpen]);

	// Filter features based on search and exclude archived features
	const filteredFeatures = features.filter(
		(feature: Feature) =>
			!feature.archived &&
			feature.name.toLowerCase().includes(searchValue.toLowerCase()),
	);

	// Get features already in the plan (for showing "Already in plan" tag)
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
					<DropdownMenu open={selectOpen} onOpenChange={setSelectOpen}>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2",
								)}
							>
								<span className="text-t4">Select a feature</span>
								<CaretDownIcon className="size-4 opacity-50" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="w-(--radix-dropdown-menu-trigger-width)"
						>
							{/* Search input */}
							<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
								<MagnifyingGlassIcon className="size-4 text-t4" />
								<input
									type="text"
									placeholder="Search features..."
									value={searchValue}
									onChange={(e) => setSearchValue(e.target.value)}
									onKeyDown={(e) => e.stopPropagation()}
									className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
								/>
							</div>

							<div className="max-h-60 overflow-y-auto">
								{filteredFeatures.length === 0 ? (
									<div className="py-4 text-center text-sm text-t4">
										No features found.
									</div>
								) : (
									filteredFeatures.map((feature: Feature) => (
										<DropdownMenuItem
											key={feature.id}
											onClick={() => handleFeatureSelect(feature.id)}
											className="py-2 px-2.5"
										>
											<div className="flex items-center gap-2 w-full">
												<div className="shrink-0">
													{getFeatureIcon({ feature })}
												</div>
												<span className="truncate flex-1">{feature.name}</span>
												{featuresInPlan.has(feature.id) && (
													<span className="shrink-0 text-xs text-t3 bg-muted px-1 py-0 rounded-md">
														Already in plan
													</span>
												)}
											</div>
										</DropdownMenuItem>
									))
								)}
							</div>

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
						</DropdownMenuContent>
					</DropdownMenu>
				</SheetSection>
			</div>
		</div>
	);
}
