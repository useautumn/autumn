import { productV2ToBasePrice } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { PricingTableContainer } from "@/components/autumn/PricingTableContainer";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Card, CardContent, CardHeader } from "@/components/v2/cards/Card";
import { Separator } from "@/components/v2/separator";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan, useSheetStore } from "@/hooks/stores/useSheetStore";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanCardToolbar } from "../products/plan/components/plan-card/PlanCardToolbar";
import { PlanFeatureList } from "../products/plan/components/plan-card/PlanFeatureList";
import { DummyFeatureRow } from "./components/DummyFeatureRow";
import { useOnboarding3QueryState } from "./hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "./store/useOnboardingStore";
import { getStepNumber } from "./utils/onboardingUtils";

interface OnboardingPreviewProps {
	setConnectStripeOpen?: (open: boolean) => void;
}

export const OnboardingPreview = ({
	setConnectStripeOpen,
}: OnboardingPreviewProps) => {
	// Get step from query state
	const { queryStates } = useOnboarding3QueryState();
	const step = queryStates.step;

	// Get state from Zustand
	const playgroundMode = useOnboardingStore((state) => state.playgroundMode);
	const feature = useFeatureStore((state) => state.feature);
	const setSheet = useSheetStore((state) => state.setSheet);
	const isPlanBeingEdited = useIsEditingPlan();
	const handleDeletePlanSuccess = useOnboardingStore(
		(s) => s.handleDeletePlanSuccess,
	);

	const product = useProductStore((s) => s.product);
	const { products: allProducts } = useProductsQuery();

	const currentStep = getStepNumber(step);

	const showBasicInfo = currentStep >= 1;
	const showPricing = currentStep >= 1;
	const showDummyFeature = currentStep === 2;
	const showFeatures = currentStep >= 3;
	const showToolbar = currentStep >= 4;
	const allowAddFeature = currentStep >= 4;
	const showPricingTable = currentStep === 5;

	// Get the base price from the product (only if product exists and has proper structure)
	const basePrice = product?.items ? productV2ToBasePrice({ product }) : null;

	if (!product) {
		return (
			<Card className="min-w-sm max-w-xl mx-4 bg-card bg-card-border w-[80%] opacity-90">
				<CardContent className="p-8 text-center text-gray-400">
					Loading preview...
				</CardContent>
			</Card>
		);
	}

	const handleEdit = () => {
		setSheet({ type: "edit-plan" });
	};

	// Show preview mode for step 4 (Playground) when in preview mode OR step 5
	if (showPricingTable || (currentStep === 4 && playgroundMode === "preview")) {
		return (
			<div className="overflow-auto max-h-screen">
				<PricingTableContainer
					setConnectStripeOpen={setConnectStripeOpen ?? (() => {})}
				/>
			</div>
		);
	}

	return (
		<Card className="min-w-[28rem] max-w-xl mx-4 bg-card border-border border-[0.5px] p-4">
			<CardHeader className="gap-0 px-0">
				<div className="flex flex-row items-center justify-between w-full">
					<div className="flex flex-row items-center gap-2 min-w-0 flex-1">
						{showBasicInfo && product?.name ? (
							<span className="text-main-sec truncate">{product.name}</span>
						) : (
							<span className="text-main-sec !text-t4 truncate">
								Name your product
							</span>
						)}

						{playgroundMode === "edit" && product && (
							<PlanTypeBadges product={product} />
						)}
					</div>
					<div className="flex flex-row items-center gap-1">
						{showToolbar && (
							<PlanCardToolbar
								onEdit={handleEdit}
								onDeleteSuccess={handleDeletePlanSuccess || undefined}
								deleteDisabled={allProducts?.length === 1}
								deleteTooltip={
									allProducts?.length === 1
										? "At least 1+ product is required."
										: undefined
								}
							/>
						)}
					</div>
				</div>

				{showPricing && (
					<IconButton
						variant="secondary"
						icon={<CrosshairSimpleIcon />}
						className="mt-2 !opacity-100"
						onClick={handleEdit}
						disabled={isPlanBeingEdited}
					>
						{basePrice?.amount ? (
							<span className="text-sm font-medium text-t2">
								${basePrice.amount}/
								{keyToTitle(basePrice.interval ?? "once", {
									exclusionMap: { one_off: "once" },
								}).toLowerCase()}
							</span>
						) : (
							<span className="text-t4 text-sm">No price set</span>
						)}
					</IconButton>
				)}
			</CardHeader>
			{showDummyFeature && feature && (
				<>
					<Separator className="my-2" />
					<DummyFeatureRow feature={feature} />
				</>
			)}

			{showFeatures && <Separator />}
			<CardContent className="max-w-full px-0 gap-0">
				{showFeatures && (
					<div>
						<PlanFeatureList allowAddFeature={allowAddFeature} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};
