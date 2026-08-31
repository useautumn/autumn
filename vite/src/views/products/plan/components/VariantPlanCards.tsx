import {
	useAllVariantsView,
	useProductQuery,
} from "../../product/hooks/useProductQuery";
import { VariantPlanCard } from "./variant-card/VariantPlanCard";
import { groupVariantRowsByPlanId } from "./variant-card/variantRowVersion";

export function VariantPlanCards() {
	const { variants } = useProductQuery();
	const showAllVariants = useAllVariantsView();
	const groups = groupVariantRowsByPlanId(variants);

	if (!showAllVariants || groups.length === 0) return null;

	return (
		<div className="flex w-full flex-col items-center gap-4">
			{groups.map((rows) => (
				<VariantPlanCard key={rows[0].id} rows={rows} />
			))}
		</div>
	);
}
