import type { CreateFeature, ProductItem } from "@autumn/shared";
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

	if (editingState?.type === "plan") {
		return <EditPlanSheet isOnboarding />;
	}

	if (editingState?.type === "feature") {
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
			setProduct((prevProduct) => {
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
				const originalIndex = prevProduct.items.findIndex(
					(item) => item === targetItem,
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

	// Handle new-feature sheet
	if (sheet === "new-feature") {
		return <NewFeatureSheet isOnboarding />;
	}
	switch (step) {
		case OnboardingStep.PlanDetails:
			return <PlanDetailsStep />;

		case OnboardingStep.FeatureCreation:
			return <FeatureCreationStep feature={feature} setFeature={setFeature} />;

		case OnboardingStep.FeatureConfiguration: {
			// Use consistent withBasePrice flag
			const featureItems = productV2ToFeatureItems({
				items: product?.items || [],
				withBasePrice: true,
			});
			const currentItem = featureItems[featureItems.length - 1] || null;

			// Update the item in the product when it changes
			// Use functional setState to avoid stale closure issues
			const setCurrentItem = (updatedItem: ProductItem) => {
				setProduct((prevProduct) => {
					if (!prevProduct?.items) return prevProduct;

					// Find the feature items to identify which one we're updating
					const prevFeatureItems = productV2ToFeatureItems({
						items: prevProduct.items,
						withBasePrice: true,
					});
					const targetItem = prevFeatureItems[prevFeatureItems.length - 1];

					if (!targetItem) return prevProduct;

					// Find this item in the ORIGINAL items array (not filtered)
					const originalIndex = prevProduct.items.findIndex(
						(item) => item === targetItem,
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
			// This case is handled by the useEffect in useOnboardingLogic that opens edit-plan sheet
			return null;

		case OnboardingStep.Completion:
			return <CompletionStep />;

		default:
			return null;
	}
};
