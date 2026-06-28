import { useVariantViewStore } from "@/hooks/stores/useVariantViewStore";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { VariantPlanCard } from "./variant-card/VariantPlanCard";

export function VariantPlanCards() {
	const { variants } = useProductQuery();
	const showAllVariants = useVariantViewStore((s) => s.showAllVariants);

	if (!showAllVariants || variants.length === 0) return null;

	return (
		<div className="flex w-full flex-col items-center gap-4">
			{variants.map((variant) => (
				<VariantPlanCard key={variant.id} variant={variant} />
			))}
		</div>
	);
}
