import type { ProductItem } from "@autumn/shared";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";

export function PlanPreviewItems({
	items,
	hiddenItemCount,
	currency,
}: {
	items: ProductItem[];
	hiddenItemCount: number;
	currency?: string;
}) {
	return (
		<ul className="flex min-w-0 flex-col gap-1">
			{items.map((item, index) => (
				<li
					key={`${item.feature_id}-${index}`}
					className="flex min-w-0 items-center gap-1.5 tabular-nums"
				>
					<PlanItemLabel item={item} currency={currency} compact />
				</li>
			))}
			{hiddenItemCount > 0 && (
				<li className="text-tiny text-subtle tabular-nums">
					+{hiddenItemCount} more
				</li>
			)}
		</ul>
	);
}
