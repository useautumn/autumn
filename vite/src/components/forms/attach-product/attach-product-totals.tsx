import type { CheckoutResponseV0 } from "@autumn/shared";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";

export function AttachProductTotals({
	previewData,
}: {
	previewData?: CheckoutResponseV0 | null;
}) {
	const total = previewData?.total || 0;
	const nextCycleTotal = previewData?.next_cycle?.total || 0;
	const nextCycleStartsAt = formatUnixToDate(
		previewData?.next_cycle?.starts_at || 0,
	);

	return (
		<div className="px-4 space-y-1 text-sm">
			<div className="flex items-center justify-between ">
				<div className="font-medium text-foreground">Total</div>
				<div className="font-semibold text-foreground">${total.toFixed(2)}</div>
			</div>
			{nextCycleStartsAt && (
				<div className="flex items-center justify-between">
					<div className="font-medium text-t4">
						Next Cycle ({nextCycleStartsAt})
					</div>
					<div className="font-semibold text-t4">
						${nextCycleTotal.toFixed(2)}
					</div>
				</div>
			)}
		</div>
	);
}
