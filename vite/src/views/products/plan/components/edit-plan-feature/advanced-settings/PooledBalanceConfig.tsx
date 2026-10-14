import { AreaCheckbox } from "@autumn/ui";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PooledBalanceConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	return (
		<AreaCheckbox
			title="Pooled balance"
			description="Combine grants from entity-attached instances of this plan into a shared customer balance."
			checked={item.pooled ?? false}
			onCheckedChange={(pooled) => setItem({ ...item, pooled })}
		/>
	);
}
