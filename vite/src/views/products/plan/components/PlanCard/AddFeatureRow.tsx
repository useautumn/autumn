import { type Feature, ProductItemInterval } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CustomDialogContent } from "@/components/general/modal-components/DialogContentWrapper";
import { Dialog } from "@/components/ui/dialog";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CreateFeature } from "@/views/products/features/components/CreateFeature";
import { FeatureTypeBadge } from "@/views/products/features/components/FeatureTypeBadge";
import { useProductContext } from "@/views/products/product/ProductContext";

interface AddFeatureRowProps {
	disabled?: boolean;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const { product, setProduct, setSheet, setEditingState } =
		useProductContext();

	// State for popover and create feature dialog
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [createFeatureOpen, setCreateFeatureOpen] = useState(false);

	const handleFeatureSelect = (feature: Feature) => {
		if (!product || !feature.id) return;

		// Create a new item with the selected feature
		const newItem = {
			feature_id: feature.id,
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

		// Close popover
		setPopoverOpen(false);

		// Open edit sidebar for the new item
		const itemIndex = (product.items || []).length;
		const itemId =
			newItem.entity_feature_id || newItem.feature_id || `item-${itemIndex}`;
		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");
	};

	return (
		<div>
			{features.length > 0 ? (
				// Show popover with feature dropdown when features exist
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="group/btn flex items-center justify-center bg-white border border-border rounded-lg h-[30px] w-full shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed form-input"
							tabIndex={0}
							disabled={disabled}
							aria-label="Add new feature"
						>
							<div
								className={
									disabled
										? "text-t6"
										: "text-t3 group-hover/btn:text-primary transition-colors"
								}
							>
								<PlusIcon size={16} weight="regular" />
							</div>
						</button>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-0" align="start">
						<div className="max-h-60 overflow-y-auto">
							<div className="px-3 py-2 text-sm font-medium text-muted-foreground border-b">
								Select a feature
							</div>
							{features
								.filter((feature: Feature) => !feature.archived)
								.map((feature: Feature) => (
									<button
										key={feature.id}
										type="button"
										className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors focus:bg-muted/50 focus:outline-none"
										onClick={() => handleFeatureSelect(feature)}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm">{feature.name}</span>
											<FeatureTypeBadge {...feature} />
										</div>
									</button>
								))}
							<div className="border-t p-1">
								<button
									type="button"
									className="w-full px-3 py-2 text-left text-primary hover:bg-muted/50 transition-colors focus:bg-muted/50 focus:outline-none text-sm font-medium"
									onClick={() => {
										setPopoverOpen(false);
										setCreateFeatureOpen(true);
									}}
								>
									<div className="flex items-center gap-2">
										<PlusIcon size={14} />
										Create new feature
									</div>
								</button>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			) : (
				// Show create feature dialog when no features exist
				<button
					type="button"
					className="group/btn flex items-center justify-center bg-white border border-border rounded-lg h-[30px] w-full shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed form-input"
					onClick={() => setCreateFeatureOpen(true)}
					tabIndex={0}
					disabled={disabled}
					aria-label="Add new feature"
				>
					<div
						className={
							disabled
								? "text-t6"
								: "text-t3 group-hover/btn:text-primary transition-colors"
						}
					>
						<PlusIcon size={16} weight="regular" />
					</div>
				</button>
			)}

			{/* Create Feature Dialog */}
			<Dialog open={createFeatureOpen} onOpenChange={setCreateFeatureOpen}>
				<CustomDialogContent>
					<CreateFeature
						setOpen={setCreateFeatureOpen}
						open={createFeatureOpen}
					/>
				</CustomDialogContent>
			</Dialog>
		</div>
	);
};
