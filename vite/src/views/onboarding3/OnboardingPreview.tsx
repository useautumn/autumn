import type { CreateFeature } from "@autumn/shared";
import { productV2ToBasePrice } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { PricingTableContainer } from "@/components/autumn/PricingTableContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Separator } from "@/components/v2/separator";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanCardToolbar } from "../products/plan/components/PlanCard/PlanCardToolbar";
import { PlanFeatureList } from "../products/plan/components/PlanCard/PlanFeatureList";
import { useProductContext } from "../products/product/ProductContext";
import { DummyFeatureRow } from "./components/DummyFeatureRow";

interface OnboardingPreviewProps {
	currentStep: number;
	playgroundMode?: "edit" | "preview";
	setConnectStripeOpen?: (open: boolean) => void;
	feature?: CreateFeature;
}

export const OnboardingPreview = ({
	currentStep,
	playgroundMode = "edit",
	setConnectStripeOpen,
	feature,
}: OnboardingPreviewProps) => {
	const { product, setSheet, setEditingState } = useProductContext();
	const { products: allProducts } = useProductsQuery();

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
		setEditingState({ type: "plan", id: null });
		setSheet("edit-plan");
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
		<Card className="min-w-[28rem] max-w-xl mx-4 bg-card border-[#ddd] border-[0.5px] gap-0 p-4">
			<CardHeader className="gap-0 px-0">
				<div className="flex flex-row items-center justify-between w-full">
					<div className="flex flex-row items-center gap-2 min-w-0 flex-1">
						<span className="text-main-sec truncate">
							{showBasicInfo && product?.name ? product.name : "Plan Preview"}
						</span>
						{playgroundMode === "edit" && product && (
							<PlanTypeBadges product={product} />
						)}
					</div>
					<div className="flex flex-row items-center gap-1">
						{showToolbar && (
							<PlanCardToolbar
								onEdit={handleEdit}
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

				{showBasicInfo && product?.description && (
					<span className="text-sm text-t3 max-w-[80%] line-clamp-2">
						{product.description}
					</span>
				)}

				{showBasicInfo &&
					!(product?.description || product?.name || basePrice?.amount) && (
						<span className="text-body-secondary">
							Enter data on the right to see the preview
						</span>
					)}

				{showPricing && (
					<IconButton
						variant="secondary"
						icon={<CrosshairSimpleIcon />}
						className="mt-2 pointer-events-none"
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

				{showDummyFeature && feature && (
					<>
						<Separator className="my-2" />
						<DummyFeatureRow feature={feature} />
					</>
				)}
				{!showFeatures && !showDummyFeature && (
					<span className="text-body-secondary mt-2">
						Create a feature on the right
					</span>
				)}
				{showFeatures && <Separator className="my-2" />}
			</CardHeader>
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
