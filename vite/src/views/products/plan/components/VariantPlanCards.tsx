import { useProductQuery } from "../../product/hooks/useProductQuery";
import { VariantPlanCard } from "./variant-card/VariantPlanCard";

export function VariantPlanCards() {
	const { variants } = useProductQuery();

	console.log("plan variants", variants);

	if (variants.length === 0) return null;

	return (
		<div className="flex w-full max-w-5xl flex-wrap justify-center gap-4">
			{variants.map((variant) => (
				<VariantPlanCard key={variant.id} variant={variant} />
			))}
		</div>
	);
}
