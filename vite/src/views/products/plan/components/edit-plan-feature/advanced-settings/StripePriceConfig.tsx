import { FormLabel } from "@autumn/ui";
import { StripePriceSelect } from "@/components/v2/selects/StripePriceSelect";
import {
	itemStripePriceId,
	withItemStripePriceId,
} from "@/views/products/plan/components/shared/stripePriceMapping";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

/**
 * Maps this item's price to an existing Stripe price. Scoped to the version
 * being edited, since each version prices separately.
 */
export function StripePriceConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	return (
		<div className="flex flex-col gap-2">
			<FormLabel>Stripe price</FormLabel>
			<StripePriceSelect
				onChange={(stripePriceId) =>
					setItem(withItemStripePriceId({ item, stripePriceId }))
				}
				value={itemStripePriceId({ item })}
			/>
			<p className="text-tertiary-foreground text-xs">
				Bill this item under a Stripe price you already have. Applies to this
				version only.
			</p>
		</div>
	);
}
