import type { ProductItem, ProductV2 } from "@autumn/shared";
import { productV2ToFeatureItems } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getItemId } from "@/utils/product/productItemUtils";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { EditPlanSheet } from "../../products/plan/components/EditPlanSheet";
import { EditPlanFeatureSheet } from "../../products/plan/components/edit-plan-feature/EditPlanFeatureSheet";
import { NewFeatureSheet } from "../../products/plan/components/new-feature/NewFeatureSheet";
import { SelectFeatureSheet } from "../../products/plan/components/SelectFeatureSheet";
import { useOnboarding3QueryState } from "../hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "../store/useOnboardingStore";
import { OnboardingStep } from "../utils/onboardingUtils";
import { FeatureConfigurationStep } from "./FeatureConfigurationStep";
import { FeatureCreationStep } from "./FeatureCreationStep";
import { IntegrationStep } from "./IntegrationStep";
import { PlanDetailsStep } from "./PlanDetailsStep";
import { AvailableFeatures } from "./playground-step/AvailableFeatures";
import { QuickStartCodeGroup } from "./playground-step/QuickStartCodeGroup";

export const OnboardingStepRenderer = () => {
	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Get state from Zustand
	const playgroundMode = useOnboardingStore((state) => state.playgroundMode);
	const setLastUsedProductId = useOnboardingStore(
		(state) => state.setLastUsedProductId,
	);
	const feature = useFeatureStore((state) => state.feature);

	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const sheetType = useSheetStore((s) => s.type);
	const itemId = useSheetStore((s) => s.itemId);

	const [trackResponse, setTrackResponse] = useState<any>(null);
	const [checkResponse, setCheckResponse] = useState<any>(null);

	const [lastUsedFeatureId, setLastUsedFeatureId] = useState<
		string | undefined
	>(undefined);

	// Track product ID changes when in playground mode
	useEffect(() => {
		if (step === OnboardingStep.Playground && product?.id) {
			setLastUsedProductId(product.id);
		}
	}, [product?.id, step, setLastUsedProductId]);

	// Don't render overrides when on Integration step or Playground preview mode - allow the step to render normally
	const shouldSkipOverrides =
		step === OnboardingStep.Integration ||
		(step === OnboardingStep.Playground && playgroundMode === "preview");

	// Handle all override conditions first (before switch statement)
	if (!shouldSkipOverrides) {
		// Plan editing override
		if (sheetType === "edit-plan") {
			return <EditPlanSheet isOnboarding />;
		}

		// New feature creation override
		if (sheetType === "new-feature") {
			return <NewFeatureSheet isOnboarding />;
		}

		// Select feature override
		if (sheetType === "select-feature") {
			return <SelectFeatureSheet isOnboarding />;
		}

		// Existing feature editing override
		if (sheetType === "edit-feature" && itemId) {
			const featureItems = productV2ToFeatureItems({
				items: product?.items || [],
				withBasePrice: true,
			});
			const isCurrentItem = (item: ProductItem, index: number) => {
				const currentItemId = getItemId({ item, itemIndex: index });
				return itemId === currentItemId;
			};
			const currentItem = featureItems.find(isCurrentItem);

			const setCurrentItem = (updatedItem: ProductItem) => {
				if (!product || !product.items) return;

				const filteredItems = productV2ToFeatureItems({
					items: product.items,
					withBasePrice: true,
				});

				const currentItemIndex = filteredItems.findIndex((item, index) => {
					const currentItemId = getItemId({ item, itemIndex: index });
					return itemId === currentItemId;
				});

				if (currentItemIndex === -1) return;

				const targetItem = filteredItems[currentItemIndex];

				// Find this item in the ORIGINAL items array
				const originalIndex = product.items.indexOf(targetItem);

				if (originalIndex === -1) return;

				// Update that specific index in the original array
				const updatedItems = [...product.items];
				updatedItems[originalIndex] = updatedItem;

				setProduct({ ...product, items: updatedItems } as ProductV2);
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
			return <FeatureCreationStep />;

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
				if (!product?.items) return;

				// Find the index of the item with matching feature_id in the original items array
				const originalIndex = product.items.findIndex(
					(item) => item.feature_id === feature.id,
				);

				if (originalIndex === -1) return;

				// Update that specific index in the original array
				const updatedItems = [...product.items];
				updatedItems[originalIndex] = updatedItem;

				setProduct({ ...product, items: updatedItems } as ProductV2);
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
							onCheckSuccess={setCheckResponse}
							onFeatureUsed={setLastUsedFeatureId}
						/>
						<QuickStartCodeGroup
							trackResponse={trackResponse}
							checkResponse={checkResponse}
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
