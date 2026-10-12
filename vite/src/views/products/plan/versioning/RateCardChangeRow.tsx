import type { Feature } from "@autumn/shared";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { cn } from "@/lib/utils";
import { planItemV1ToProductItem } from "@/utils/product/productItemUtils/planItemV1ToProductItem";
import { RateStateBadge } from "@/views/products/features/credit-systems/components/rate-card/RateStateBadge";
import { RateValue } from "@/views/products/features/credit-systems/components/rate-card/RateValue";
import type { RateCardItemChange } from "@/views/products/features/credit-systems/utils/rateCardRows";

/** A plan item whose only change is its rate card: one row, then each feature's old and new rate. */
export function RateCardChangeRow({
	itemChange,
	features,
}: {
	itemChange: RateCardItemChange;
	features: Feature[];
}) {
	const productItem = planItemV1ToProductItem({
		item: itemChange.change.item,
		features,
	});
	if (!productItem) return null;

	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2 py-1">
				<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
					<PlanItemLabel item={productItem} />
				</div>
				<RateStateBadge label="Rate card changed" />
			</div>
			{itemChange.rates.map(({ featureId, label, from, to }) => (
				<div
					key={featureId}
					className="flex items-center justify-between gap-3 border-input border-t py-1.5 text-xs"
				>
					<span
						className={cn(
							to === null ? "text-tertiary-foreground" : "text-foreground",
						)}
					>
						{label}
					</span>
					{to === null ? (
						<span className="text-tertiary-foreground">Not covered</span>
					) : (
						<RateValue
							rate={to}
							previousRate={from}
							layout="arrow"
							className="text-xs"
						/>
					)}
				</div>
			))}
		</div>
	);
}
