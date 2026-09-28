import type { ProductItem, ProductV2 } from "@autumn/shared";
import { StatusChip } from "@autumn/ui";
import type { ReactNode } from "react";
import { PlanIcon } from "@/components/forms/shared/SelectedPlanRow";
import {
	PLAN_STATUS_CONFIG,
	type PlanStatus,
} from "../../utils/planStatusConfig";
import { PlanPriceLabel } from "../PlanPriceLabel";
import { StatusConfigChip } from "../StatusConfigChip";

/** A plan's name, scope, status and price, with row controls trailing. */
export function PlanTrayLine({
	productId,
	product,
	items,
	isCustom,
	scopeLabel,
	status,
	badge,
	controls,
}: {
	productId: string;
	product: ProductV2 | undefined;
	items: ProductItem[] | null;
	isCustom?: boolean;
	scopeLabel?: string;
	status?: PlanStatus;
	badge?: ReactNode;
	controls?: ReactNode;
}) {
	return (
		<div className="flex min-h-8 min-w-0 items-center gap-2 pl-1">
			<PlanIcon isAddOn={product?.is_add_on === true} isCustom={isCustom} />
			<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
				{product?.name ?? productId}
			</span>
			{scopeLabel && (
				<StatusChip className="max-w-32 text-tertiary-foreground">
					<span className="truncate">{scopeLabel}</span>
				</StatusChip>
			)}
			{badge}
			{status && <StatusConfigChip config={PLAN_STATUS_CONFIG[status]} />}
			{product && <PlanPriceLabel product={product} items={items} />}
			{controls}
		</div>
	);
}
