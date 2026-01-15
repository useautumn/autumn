import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import type { PreviewProduct } from "./previewTypes";

interface PreviewPlanHeaderProps {
	product: PreviewProduct;
}

export function PreviewPlanHeader({ product }: PreviewPlanHeaderProps) {
	const { basePrice } = product;

	return (
		<div className="flex flex-col gap-1.5">
			{/* Name row with badges */}
			<div className="flex items-center gap-1.5">
				<span className="text-sm font-medium text-foreground truncate">
					{product.name}
				</span>
				<PlanTypeBadges
					product={{
						is_default: !!product.isDefault,
						free_trial: product.freeTrial,
						is_add_on: !!product.isAddOn,
					}}
					noIcon
					className="text-xs ml-1"
				/>
			</div>

			{/* Price */}
			<div className="flex items-baseline gap-1">
				<span className="text-lg font-semibold text-foreground">
					{basePrice.formattedAmount ?? basePrice.displayText}
				</span>
				{basePrice.intervalText && (
					<span className="text-xs text-t3">{basePrice.intervalText}</span>
				)}
			</div>
		</div>
	);
}
