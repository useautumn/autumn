import { cn } from "@/lib/utils";
import { rateChangeParts } from "@/views/products/features/credit-systems/utils/rateCardRows";
import type { FeatureRateChange } from "./rateCardItemChanges";

/** One feature under a rate card change: old rate struck through, then the new one or "Not covered". */
export function FeatureRateChangeRow({ rate }: { rate: FeatureRateChange }) {
	const parts =
		rate.from !== null && rate.to !== null
			? rateChangeParts({ from: rate.from, to: rate.to })
			: null;

	return (
		<div className="flex items-center justify-between gap-3 border-input border-t py-1.5 text-xs">
			<span
				className={cn(
					rate.to === null ? "text-tertiary-foreground" : "text-foreground",
				)}
			>
				{rate.label}
			</span>
			{rate.to === null ? (
				<span className="text-tertiary-foreground">Not covered</span>
			) : (
				<span className="flex items-baseline gap-1.5">
					{parts && (
						<>
							<span className="text-subtle line-through">{parts.from}</span>
							<span className="text-subtle">→</span>
						</>
					)}
					<span className="font-medium text-foreground">{rate.to}</span>
				</span>
			)}
		</div>
	);
}
