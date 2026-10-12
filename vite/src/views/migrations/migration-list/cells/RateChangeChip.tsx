import { StatusChip } from "@autumn/ui";
import { rateChangeParts } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import type { RateChildView } from "../rowView/operationsView";

/** A nested rate: its metered feature's tile, old struck through, new in full weight, unit once. */
export function RateChangeChip({ child }: { child: RateChildView }) {
	const { from, to, unit } = rateChangeParts(child.change);
	return (
		<StatusChip tone={child.tile.tone} glyph={child.tile.glyph}>
			<span className="min-w-0 truncate">{child.change.label}</span>
			<span className="flex shrink-0 items-baseline gap-1 font-[450] text-tertiary-foreground">
				{from !== null && (
					<>
						<span className="text-subtle line-through">{from}</span>
						<span className="text-subtle">→</span>
					</>
				)}
				<span className="font-medium text-foreground">{to}</span>
				{unit && <span>{unit.trim()}</span>}
			</span>
		</StatusChip>
	);
}
