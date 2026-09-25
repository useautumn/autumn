import type { ReviewChangeQuantity } from "../../utils/review/types/reviewChange";

export function ReviewQuantityChangeLine({
	quantity,
}: {
	quantity: Required<ReviewChangeQuantity>;
}) {
	return (
		<span className="flex items-center gap-1 text-xs tabular-nums text-subtle">
			Quantity
			<span className="font-medium text-tertiary-foreground">
				{quantity.previous}
			</span>
			→<span className="font-semibold text-amber-500">{quantity.current}</span>
		</span>
	);
}
