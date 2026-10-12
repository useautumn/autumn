import { cn } from "@autumn/ui/lib/utils";
import {
	type RateChange,
	rateChangeParts,
} from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";

export function RateChangeRow({ change }: { change: RateChange }) {
	const { from, to, unit } = rateChangeParts(change);
	return (
		<div className="flex items-center justify-between gap-3 min-w-0 px-2 py-0.5 text-xs">
			<span className="truncate min-w-0 font-medium text-foreground">
				{change.label}
			</span>
			<span className="flex items-center gap-1 shrink-0 text-tertiary-foreground">
				{from !== null && (
					<>
						<span>{from}</span>
						<span className="text-subtle">→</span>
					</>
				)}
				<span className={cn(from !== null && "font-medium text-foreground")}>
					{to}
				</span>
				{unit && <span>{unit.trim()}</span>}
			</span>
		</div>
	);
}
