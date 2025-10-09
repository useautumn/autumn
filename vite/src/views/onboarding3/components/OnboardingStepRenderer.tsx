import type { CreateFeature, ProductItem, ProductV2 } from "@autumn/shared";
import { productV2ToFeatureItems } from "@autumn/shared";
import { useState } from "react";
import { getItemId } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { EditPlanFeatureSheet } from "../../products/plan/components/EditPlanFeatureSheet/EditPlanFeatureSheet";
import { EditPlanSheet } from "../../products/plan/components/EditPlanSheet";
import { NewFeatureSheet } from "../../products/plan/components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "../../products/plan/components/SelectFeatureSheet";
import { OnboardingStep } from "../utils/onboardingUtils";
import { FeatureConfigurationStep } from "./FeatureConfigurationStep";
import { FeatureCreationStep } from "./FeatureCreationStep";
import { IntegrationStep } from "./IntegrationStep";
import { PlanDetailsStep } from "./PlanDetailsStep";
import { AvailableFeatures } from "./playground-step/AvailableFeatures";
import { QuickStartCodeGroup } from "./playground-step/QuickStartCodeGroup";

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
	const { product, setProduct, editingState } = useProductContext();
	const [trackResponse, setTrackResponse] = useState<any>(null);
	const [lastUsedFeatureId, setLastUsedFeatureId] = useState<
		string | undefined
	>(undefined);

	// Don't render overrides when on Integration step or Playground preview mode - allow the step to render normally
	const shouldSkipOverrides =
		step === OnboardingStep.Integration ||
		(step === OnboardingStep.Playground && playgroundMode === "preview");

	// Handle all override conditions first (before switch statement)
	if (!shouldSkipOverrides) {
		// Plan editing override
		if (editingState?.type === "plan") {
			return <EditPlanSheet isOnboarding />;
		}

		// New feature creation override
		if (editingState?.type === "feature" && editingState.id === "new") {
			return <NewFeatureSheet isOnboarding />;
		}

		// Select feature override
		if (editingState?.type === "feature" && editingState.id === "select") {
			return <SelectFeatureSheet isOnboarding />;
		}

		// Existing feature editing override
		if (editingState?.type === "feature" && editingState.id !== "new") {
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
	}

	// Step-based rendering (fallback when no overrides are active)
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
				withBasePrice: false, // Don't include base price when looking for feature items
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
				return (
					<>
						<AvailableFeatures
							onTrackSuccess={setTrackResponse}
							onFeatureUsed={setLastUsedFeatureId}
						/>
						<QuickStartCodeGroup
							trackResponse={trackResponse}
							featureId={lastUsedFeatureId}
						/>
					</>
				);
			}
			// In edit mode, handled by the useEffect in useOnboardingLogic that opens edit-plan sheet
			return null;

		case OnboardingStep.Integration:
			return <IntegrationStep />;

		default:
			return null;
	}
};
