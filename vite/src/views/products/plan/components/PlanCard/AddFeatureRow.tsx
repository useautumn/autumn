import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { CustomDialogContent } from "@/components/general/modal-components/DialogContentWrapper";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CreateFeature } from "@/views/products/features/components/CreateFeature";
import { useProductContext } from "@/views/products/product/ProductContext";
import { CreateItemDialogContent } from "@/views/products/product/product-item/create-product-item/CreateItemDialogContent";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { useSteps } from "@/views/products/product/product-item/useSteps";
import { CreateItemStep } from "@/views/products/product/product-item/utils/CreateItemStep";

interface AddFeatureRowProps {
	disabled?: boolean;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const { product, setProduct, setSheet, setEditingState } =
		useProductContext();

	const [open, setOpen] = useState(false);
	const [item, setItem] = useState({
		feature_id: null,
		included_usage: null,
		interval: "month",
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		reset_usage_when_enabled: true,
	});

	// Real step management - following OG logic pattern
	const stepState = useSteps({ initialStep: CreateItemStep.CreateItem });

	// Reset state when dialog first opens - maintain OG logic simplicity
	const [hasOpened, setHasOpened] = useState(false);
	useEffect(() => {
		if (open && !hasOpened) {
			setItem({
				feature_id: null,
				included_usage: null,
				interval: "month",
				price: null,
				tiers: null,
				billing_units: 1,
				entity_feature_id: null,
				reset_usage_when_enabled: true,
			});
			stepState.resetSteps();
			setHasOpened(true);
		} else if (!open) {
			setHasOpened(false);
		}
	}, [open, hasOpened, stepState.resetSteps]);

	const handleCreateProductItem = async () => {
		if (!product || !item.feature_id) return null;

		const newItems = [...(product.items || []), item];
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		setOpen(false);

		// to do: probably need a better way to track items, because any of these can change or be null
		const itemIndex = (product.items || []).length;
		const itemId =
			item.entity_feature_id || item.feature_id || `item-${itemIndex}`;
		setEditingState({ type: "feature", id: itemId });
		setSheet("edit-feature");

		return updatedProduct;
	};

	return (
		<div>
			{features.length > 0 ? (
				<div>
					<Dialog open={open} onOpenChange={setOpen}>
						<ProductItemContext.Provider
							value={{
								item,
								setItem,
								showCreateFeature: false,
								setShowCreateFeature: () => {},
								isUpdate: false,
								handleCreateProductItem,
								stepState,
								setOpen,
								warning: null,
							}}
						>
							<CreateItemDialogContent open={open} setOpen={setOpen} />
						</ProductItemContext.Provider>
					</Dialog>
					<button
						type="button"
						className="group/btn flex items-center justify-center bg-white border border-border rounded-lg h-[30px] w-full shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed form-input"
						onClick={() => setOpen(true)}
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
				</div>
			) : (
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<button
							type="button"
							className="group/btn flex items-center justify-center bg-white border border-border rounded-lg h-[30px] w-full shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed form-input"
							onClick={() => setOpen(true)}
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
					</DialogTrigger>
					<CustomDialogContent>
						<CreateFeature setOpen={setOpen} open={open} />
					</CustomDialogContent>
				</Dialog>
			)}
		</div>
	);
};
