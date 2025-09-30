import type { CreateFeature, ProductItem } from "@autumn/shared";
import { productV2ToFeatureItems } from "@autumn/shared";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { EditPlanFeatureSheet } from "../../products/plan/components/EditPlanFeatureSheet/EditPlanFeatureSheet";
import { EditPlanSheet } from "../../products/plan/components/EditPlanSheet";
import { NewFeatureSheet } from "../../products/plan/components/new-feature/NewFeatureSheet";
import { OnboardingStep } from "../utils/OnboardingStep";
import { CompletionStep } from "./CompletionStep";
import { FeatureConfigurationStep } from "./FeatureConfigurationStep";
import { FeatureCreationStep } from "./FeatureCreationStep";
import { PlanDetailsStep } from "./PlanDetailsStep";
import { PlaygroundStep } from "./PlaygroundStep";

interface OnboardingStepRendererProps {
	step: OnboardingStep;
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}

export const OnboardingStepRenderer = ({
	step,
	feature,
	setFeature,
}: OnboardingStepRendererProps) => {
	const { product, setProduct, editingState, sheet } = useProductContext();

	// Handle sheet overrides (mirror PlanEditorView logic)
	if (editingState?.type === "plan") {
		console.log(
			"[OnboardingStepRenderer] Showing EditPlanSheet for plan editing",
		);
		return <EditPlanSheet />;
	}

	if (editingState?.type === "feature") {
		console.log(
			"[OnboardingStepRenderer] Showing EditPlanFeatureSheet for feature editing",
		);

		// Find the current item being edited (same logic as PlanEditorView)
		const featureItems = productV2ToFeatureItems({ items: product?.items });
		const isCurrentItem = (item: ProductItem, index: number) => {
			const itemId = getItemId({ item, itemIndex: index });
			return editingState.id === itemId;
		};
		const currentItem = featureItems.find(isCurrentItem);

		const setCurrentItem = (updatedItem: ProductItem) => {
			if (!product || !product.items) return;

			const filteredItems = productV2ToFeatureItems({
				items: product.items,
				withBasePrice: true,
			});

			const currentItemIndex = filteredItems.findIndex(isCurrentItem);

			if (currentItemIndex === -1) return;

			const updatedItems = [...filteredItems];
			updatedItems[currentItemIndex] = updatedItem;
			setProduct({ ...product, items: updatedItems });
		};

		return (
			<ProductItemContext.Provider
				value={{
					item: currentItem ?? null,
					setItem: setCurrentItem,
					selectedIndex: 0,
					showCreateFeature: false,
					setShowCreateFeature: () => {},
					isUpdate: false,
					handleUpdateProductItem: async () => null,
				}}
			>
				<EditPlanFeatureSheet />
			</ProductItemContext.Provider>
		);
	}

	// Handle new-feature sheet
	if (sheet === "new-feature") {
		console.log(
			"[OnboardingStepRenderer] Showing NewFeatureSheet for creating new feature",
		);
		return <NewFeatureSheet />;
	}
	switch (step) {
		case OnboardingStep.PlanDetails:
			return <PlanDetailsStep />;

		case OnboardingStep.FeatureCreation:
			return <FeatureCreationStep feature={feature} setFeature={setFeature} />;

		case OnboardingStep.FeatureConfiguration: {
			// Find the last added item (the one we just created) in the product
			const featureItems = productV2ToFeatureItems({
				items: product?.items || [],
			});
			const currentItem = featureItems[featureItems.length - 1] || null;

			// Update the item in the product when it changes
			const setCurrentItem = (updatedItem: ProductItem) => {
				if (!product?.items || !currentItem) return;

				const itemIndex = featureItems.length - 1;
				const updatedItems = [...featureItems];
				updatedItems[itemIndex] = updatedItem;

				setProduct({ ...product, items: updatedItems });
			};

			return (
				<ProductItemContext.Provider
					value={{
						item: currentItem,
						setItem: setCurrentItem,
						selectedIndex: featureItems.length - 1,
						showCreateFeature: false,
						setShowCreateFeature: () => {},
						isUpdate: false,
						handleUpdateProductItem: async () => null,
					}}
				>
					<FeatureConfigurationStep />
				</ProductItemContext.Provider>
			);
		}

		case OnboardingStep.Playground:
			return <PlaygroundStep />;

		case OnboardingStep.Completion:
			return <CompletionStep />;

		default:
			return null;
	}
};
