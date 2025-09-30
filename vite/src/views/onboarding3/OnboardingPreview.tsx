import { productV2ToBasePrice } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanCardToolbar } from "../products/plan/components/PlanCard/PlanCardToolbar";
import { PlanFeatureList } from "../products/plan/components/PlanCard/PlanFeatureList";
import { useProductContext } from "../products/product/ProductContext";

interface OnboardingPreviewProps {
	currentStep: number;
}

export const OnboardingPreview = ({ currentStep }: OnboardingPreviewProps) => {
	const { product, setSheet, setEditingState } = useProductContext();
	const showBasicInfo = currentStep >= 1;
	const showPricing = currentStep >= 1; // Show pricing from step 1 now
	const showFeatures = currentStep >= 3; // Show features after they're configured
	const showToolbar = currentStep >= 4; // Show edit/delete in playground step
	const allowAddFeature = currentStep >= 4; // Only allow adding features in playground step

	// Get the base price from the product (only if product exists and has proper structure)
	const basePrice = product?.items ? productV2ToBasePrice({ product }) : null;

	// Early return if product is not properly initialized
	if (!product) {
		return (
			<Card className="min-w-sm max-w-xl mx-4 bg-card w-[80%] opacity-90">
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

	return (
		<Card className="min-w-sm max-w-xl mx-4 bg-card w-[80%]">
			<CardHeader>
				<div className="flex flex-row items-center justify-between w-full">
					<div className="flex flex-row items-center gap-2">
						<span className="text-main-sec w-fit whitespace-nowrap">
							{showBasicInfo && product?.name ? product.name : "Your Plan Name"}
						</span>
						{showBasicInfo && product?.id && (
							<CopyButton text={product.id} className="text-xs" size="sm" />
						)}
					</div>
					<div className="flex flex-row items-center gap-1">
						{showToolbar && <PlanCardToolbar onEdit={handleEdit} />}
						{!showToolbar && (
							<span className="text-xs text-gray-400">Preview</span>
						)}
					</div>
				</div>

				{showBasicInfo && product?.description && (
					<span className="text-sm text-t3 max-w-[80%] line-clamp-2">
						{product.description}
					</span>
				)}

				<IconButton
					variant="secondary"
					icon={<CrosshairSimpleIcon />}
					disabled={true}
					className="mt-2"
				>
					{showPricing && basePrice?.amount ? (
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
			</CardHeader>
			<CardContent className="max-w-full">
				{showFeatures ? (
					<div>
						<PlanFeatureList allowAddFeature={allowAddFeature} />
					</div>
				) : (
					<div className="text-sm text-gray-400 text-center py-8">
						Features will appear here
					</div>
				)}
			</CardContent>
		</Card>
	);
};
