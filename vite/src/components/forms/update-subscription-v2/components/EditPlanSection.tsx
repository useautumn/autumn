import type {
	Feature,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { featureToOptions, UsageModel } from "@autumn/shared";
import { InfoIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { PlanFeatureRow } from "@/views/products/plan/components/plan-card/PlanFeatureRow";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
	product?: ProductV2;
	customerProduct?: FullCusProduct;
	features?: Feature[];
}

function SectionTitle({ hasCustomizations }: { hasCustomizations: boolean }) {
	return (
		<span className="flex items-center gap-1.5">
			Plan Configuration
			{hasCustomizations && (
				<Tooltip>
					<TooltipTrigger asChild>
						<InfoIcon
							size={14}
							weight="fill"
							className="text-amber-500 cursor-help"
						/>
					</TooltipTrigger>
					<TooltipContent side="top">
						This subscription's configuration was edited. See changes below.
					</TooltipContent>
				</Tooltip>
			)}
		</span>
	);
}

export function EditPlanSection({
	hasCustomizations,
	onEditPlan,
	product,
	customerProduct,
	features,
}: EditPlanSectionProps) {
	return (
		<SheetSection
			title={<SectionTitle hasCustomizations={hasCustomizations} />}
			withSeparator
		>
			{product?.items && product.items.length > 0 && (
				<>
					<div className="flex gap-2 justify-between items-center h-6 mb-3">
						<BasePriceDisplay product={product} readOnly={true} />
					</div>
					<div className="space-y-2 mb-4">
						{product.items.map((item: ProductItem, index: number) => {
							if (!item.feature_id) return null;

							const feature = features?.find((f) => f.id === item.feature_id);
							const prepaidOption = featureToOptions({
								feature,
								options: customerProduct?.options,
							});

							const prepaidQuantity =
								item.usage_model === UsageModel.Prepaid
									? prepaidOption?.quantity
									: null;

							return (
								<PlanFeatureRow
									key={item.feature_id || item.price_id || index}
									item={item}
									index={index}
									readOnly={true}
									prepaidQuantity={prepaidQuantity}
								/>
							);
						})}
					</div>
				</>
			)}
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</SheetSection>
	);
}
