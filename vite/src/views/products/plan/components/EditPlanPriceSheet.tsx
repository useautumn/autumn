import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { BasePriceSection } from "./edit-plan-details/BasePriceSection";
import { PlanTypeSection } from "./edit-plan-details/PlanTypeSection";

export function EditPlanPriceSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const product = useProductStore((s) => s.product);

	if (!product) return null;

	return (
		<div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
			{!isOnboarding && (
				<SheetHeader
					title={`Configure ${product.name ? `${product.name} ` : ""}Price`}
					description="Set whether this plan is free or paid, and configure a base price"
					// noSeparator={true}
				/>
			)}
			<PlanTypeSection />
			<BasePriceSection withSeparator={false} />
		</div>
	);
}
