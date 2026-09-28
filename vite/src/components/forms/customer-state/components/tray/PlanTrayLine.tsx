import type { ProductItem, ProductV2 } from "@autumn/shared";
import type { ReactNode } from "react";
import { PlanPriceLabel } from "../PlanPriceLabel";

/** A plan's name and price, with row controls trailing. */
export function PlanTrayLine({
	productId,
	product,
	items,
	anchor,
	badge,
	controls,
}: {
	productId: string;
	product: ProductV2 | undefined;
	items: ProductItem[] | null;
	/** Zero-size popover anchor, so menus opened from the row sit under the name. */
	anchor?: ReactNode;
	badge?: ReactNode;
	controls?: ReactNode;
}) {
	return (
		<div className="flex min-h-8 min-w-0 items-center gap-2 pl-1">
			{anchor}
			<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
				{product?.name ?? productId}
			</span>
			{badge}
			{product && <PlanPriceLabel product={product} items={items} />}
			{controls}
		</div>
	);
}
