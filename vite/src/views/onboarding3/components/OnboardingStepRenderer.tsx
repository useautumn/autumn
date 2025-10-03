import type { CreateFeature, ProductItem, ProductV2 } from "@autumn/shared";
import { productV2ToFeatureItems } from "@autumn/shared";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { EditPlanFeatureSheet } from "../../products/plan/components/EditPlanFeatureSheet/EditPlanFeatureSheet";
import { EditPlanSheet } from "../../products/plan/components/EditPlanSheet";
import { NewFeatureSheet } from "../../products/plan/components/new-feature/NewFeatureSheet";
import { OnboardingStep } from "../utils/onboardingUtils";
import { CompletionStep } from "./CompletionStep";
import { FeatureConfigurationStep } from "./FeatureConfigurationStep";
import { FeatureCreationStep } from "./FeatureCreationStep";
import { PlanDetailsStep } from "./PlanDetailsStep";
import { PlaygroundPreviewMode } from "./PlaygroundStep/PlaygroundPreviewMode";

interface OnboardingStepRendererProps {
	step: OnboardingStep;
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
	playgroundMode?: "edit" | "preview";
}

export const OnboardingStepRenderer = ({
	step,
	feature,
	setFeature,
	playgroundMode = "edit",
}: OnboardingStepRendererProps) => {
	const { product, setProduct, editingState, sheet } = useProductContext();

	// Don't render overrides when on Completion step or Playground preview mode - allow the step to render normally
	const shouldSkipOverrides =
		step === OnboardingStep.Completion ||
		(step === OnboardingStep.Playground && playgroundMode === "preview");

	if (!shouldSkipOverrides && editingState?.type === "plan") {
		return <EditPlanSheet isOnboarding />;
	}

	if (!shouldSkipOverrides && editingState?.type === "feature") {
		const featureItems = productV2ToFeatureItems({
			items: product?.items || [],
			withBasePrice: true,
		});
		const isCurrentItem = (item: ProductItem, index: number) => {
			const itemId = getItemId({ item, itemIndex: index });
			return editingState.id === itemId;
		};
		const currentItem = featureItems.find(isCurrentItem);

		// Use functional setState to avoid stale closure issues
		const setCurrentItem = (updatedItem: ProductItem) => {
			setProduct((prevProduct: ProductV2) => {
				if (!prevProduct || !prevProduct.items) return prevProduct;

				const filteredItems = productV2ToFeatureItems({
					items: prevProduct.items,
					withBasePrice: true,
				});

				const currentItemIndex = filteredItems.findIndex((item, index) => {
					const itemId = getItemId({ item, itemIndex: index });
					return editingState.id === itemId;
				});

				if (currentItemIndex === -1) return prevProduct;

				const targetItem = filteredItems[currentItemIndex];

				// Find this item in the ORIGINAL items array
				const originalIndex = prevProduct.items.indexOf(targetItem);

				if (originalIndex === -1) return prevProduct;

				// Update that specific index in the original array
				const updatedItems = [...prevProduct.items];
				updatedItems[originalIndex] = updatedItem;

				return { ...prevProduct, items: updatedItems };
			});
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
				<EditPlanFeatureSheet isOnboarding />
			</ProductItemContext.Provider>
		);
	}

	// Handle new-feature sheet (but not on Completion step or Playground preview mode)
	if (!shouldSkipOverrides && sheet === "new-feature") {
		return <NewFeatureSheet isOnboarding />;
	}
	switch (step) {
		case OnboardingStep.PlanDetails:
			return <PlanDetailsStep />;

		case OnboardingStep.FeatureCreation:
			return <FeatureCreationStep feature={feature} setFeature={setFeature} />;

		case OnboardingStep.FeatureConfiguration: {
			// Find the ProductItem that corresponds to the feature being configured
			// This should be the item with the feature_id matching the current feature
			const featureItems = productV2ToFeatureItems({
				items: product?.items || [],
				withBasePrice: true,
			});

			// Find the item that matches the current feature being configured
			const currentItem =
				featureItems.find((item) => item.feature_id === feature.id) || null;

			// Update the item in the product when it changes
			const setCurrentItem = (updatedItem: ProductItem) => {
				setProduct((prevProduct: ProductV2) => {
					if (!prevProduct?.items) return prevProduct;

					// Find the index of the item with matching feature_id in the original items array
					const originalIndex = prevProduct.items.findIndex(
						(item) => item.feature_id === feature.id,
					);

					if (originalIndex === -1) return prevProduct;

					// Update that specific index in the original array
					const updatedItems = [...prevProduct.items];
					updatedItems[originalIndex] = updatedItem;

					return { ...prevProduct, items: updatedItems };
				});
			};

			return (
				<ProductItemContext.Provider
					value={{
						item: currentItem,
						setItem: setCurrentItem,
						selectedIndex: 0,
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
			// Preview mode is handled in OnboardingPreview.tsx
			// In preview mode, show the preview sidebar content
			if (playgroundMode === "preview") {
				return <PlaygroundPreviewMode />;
			}
			// In edit mode, handled by the useEffect in useOnboardingLogic that opens edit-plan sheet
			return null;

		case OnboardingStep.Completion:
			return <CompletionStep />;

		default:
			return null;
	}
};
