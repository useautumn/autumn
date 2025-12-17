import { PricingTableContainer } from "@/components/autumn/PricingTableContainer";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { Card, CardContent, CardHeader } from "@/components/v2/cards/Card";
import { Separator } from "@/components/v2/separator";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan, useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { BasePriceDisplay } from "../products/plan/components/plan-card/BasePriceDisplay";
import { DummyPlanFeatureRow } from "../products/plan/components/plan-card/DummyPlanFeatureRow";
import { PlanCardToolbar } from "../products/plan/components/plan-card/PlanCardToolbar";
import { PlanFeatureList } from "../products/plan/components/plan-card/PlanFeatureList";
import { useOnboarding3QueryState } from "./hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "./store/useOnboardingStore";
import { getStepNumber } from "./utils/onboardingUtils";

const MAX_PLAN_NAME_LENGTH = 20;
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
		<Card
			className={cn(
				"w-full max-w-xl mx-4 outline-4 outline-outer-background shadow-none p-4 rounded-2xl",
				showDummyFeature && !showFeatures && "pb-0",
				currentStep === 1 && "!gap-0",
			)}
		>
			<CardHeader className="gap-0 px-0 relative">
				{/* Absolutely positioned toolbar - CANNOT MOVE */}
				{showToolbar && (
					<div className="absolute top-0 right-0 z-10">
						<PlanCardToolbar
							onEdit={handleEdit}
							onDeleteSuccess={handleDeletePlanSuccess || undefined}
							deleteDisabled={allProducts?.length === 1}
							deleteTooltip={
								allProducts?.length === 1
									? "At least 1+ plan is required."
									: undefined
							}
						/>
					</div>
				)}

				{/* Left content with padding to avoid toolbar */}
				<div
					className={cn("flex items-center gap-2 pb-1", showToolbar && "pr-20")}
				>
					<div className="min-w-0 overflow-hidden">
						{showBasicInfo && product?.name ? (
							<div className="text-main-sec min-w-0 max-w-[50%]">
								<span className="truncate max-w-full">
									{product.name.length > MAX_PLAN_NAME_LENGTH
										? `${product.name.slice(0, MAX_PLAN_NAME_LENGTH)}...`
										: product.name}
								</span>
							</div>
						) : (
							<div className="text-main-sec !text-t4 truncate">Pro</div>
						)}
					</div>

					{playgroundMode === "edit" && product && (
						<div className="flex-shrink-0">
							<PlanTypeBadges
								product={product}
								iconOnly={product.name.length > MAX_PLAN_NAME_LENGTH - 10}
							/>
						</div>
					)}
				</div>

				{showPricing && (
					<BasePriceDisplay
						product={product}
						isOnboarding={currentStep !== 4}
					/>
					// <IconButton
					// 	variant="secondary"
					// 	icon={<CrosshairSimpleIcon />}
					// 	className="mt-2 !opacity-100 pointer-events-none"
					// 	onClick={handleEdit}
					// 	disabled={true}
					// >
					// 	{basePrice?.amount ? (
					// 		<span className="text-sm font-medium text-t2">
					// 			${basePrice.amount}/
					// 			{keyToTitle(basePrice.interval ?? "once", {
					// 				exclusionMap: { one_off: "once" },
					// 			}).toLowerCase()}
					// 		</span>
					// 	) : (
					// 		<span className="text-t4 text-sm">No price set</span>
					// 	)}
					// </IconButton>
				)}
			</CardHeader>
			{showDummyFeature && feature && (
				<>
					<Separator className="" />
					<DummyPlanFeatureRow />
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
