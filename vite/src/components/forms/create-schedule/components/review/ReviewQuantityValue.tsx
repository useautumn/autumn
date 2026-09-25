import {
	formatQuantityDelta,
	quantityDelta,
} from "../../utils/review/quantityChange";
import type { ReviewChangeQuantity } from "../../utils/review/types/reviewChange";

export function ReviewQuantityValue({
	quantity,
}: {
	quantity: ReviewChangeQuantity;
}) {
	const delta = quantityDelta(quantity);

	if (delta === undefined) {
		return (
			<span className="whitespace-nowrap text-xs font-medium tabular-nums text-subtle">
				× {quantity.current}
			</span>
		);
	}

	return (
		<span className="rounded-full bg-amber-500/10 px-2 text-xs font-semibold leading-5 tabular-nums text-amber-500">
			{formatQuantityDelta(delta)}
		</span>
	);
}
