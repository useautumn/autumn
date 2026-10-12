import {
	type RateChange,
	rateChangeParts,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

/** One rate under its plan item: old muted and struck through, new in full weight, unit once. */
export function RateChangeRow({ change }: { change: RateChange }) {
	const { from, to, unit } = rateChangeParts(change);
	return (
		<div className="flex items-center justify-between gap-3 min-w-0 border-t border-input px-3 py-1 text-[11px] leading-4">
			<span className="truncate min-w-0 text-tertiary-foreground">
				{change.label}
			</span>
			<span className="flex items-baseline gap-1 shrink-0 text-xs">
				{from !== null && (
					<>
						<span className="text-subtle line-through">{from}</span>
						<span className="text-subtle">→</span>
					</>
				)}
				<span className="font-semibold text-foreground">{to}</span>
				{unit && (
					<span className="text-tertiary-foreground">{unit.trim()}</span>
				)}
			</span>
		</div>
	);
}
