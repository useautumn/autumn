import type { ProductItem, ProductV2 } from "@autumn/shared";
import type { ReactNode } from "react";
import { PlanIcon } from "@/components/forms/shared/SelectedPlanRow";
import { PlanPriceLabel } from "../PlanPriceLabel";

/** A plan's name, scope and price, with row controls trailing. */
export function PlanTrayLine({
	productId,
	product,
	items,
	isCustom,
	scope,
	badge,
	controls,
}: {
	productId: string;
	product: ProductV2 | undefined;
	items: ProductItem[] | null;
	isCustom?: boolean;
	scope?: ReactNode;
	badge?: ReactNode;
	controls?: ReactNode;
}) {
	return (
		<div className="flex min-h-8 min-w-0 items-center gap-2 pl-1">
			<PlanIcon isAddOn={product?.is_add_on === true} isCustom={isCustom} />
			<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
				{product?.name ?? productId}
			</span>
			{scope}
			{badge}
			{product && <PlanPriceLabel product={product} items={items} />}
			{controls}
		</div>
	);
}
