import {
	type RateChange,
	rateChangeParts,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

/** One rate under its plan item: old struck through, new in full weight. */
export function RateChangeRow({ change }: { change: RateChange }) {
	const { from, to, unit } = rateChangeParts(change);
	return (
		<div className="flex items-center justify-between gap-3 min-w-0 border-t border-border/60 py-2 pr-3 pl-8 text-xs">
			<span className="truncate min-w-0 text-tertiary-foreground">
				{change.label}
			</span>
			<span className="flex items-baseline gap-1.5 shrink-0">
				{from !== null && (
					<>
						<span className="text-subtle line-through">{from}</span>
						<span className="text-subtle">→</span>
					</>
				)}
				<span className="font-medium text-foreground">
					{to}
					{unit}
				</span>
			</span>
		</div>
	);
}
