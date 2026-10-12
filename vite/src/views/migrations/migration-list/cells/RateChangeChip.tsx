import { StatusChip } from "@autumn/ui";
import { rateChangeParts } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import type { RateChildView } from "../rowView/operationsView";

/** A nested rate: its metered feature's tile, old struck through, new in full weight, unit once. Long diffs wrap. */
export function RateChangeChip({ child }: { child: RateChildView }) {
	const { from, to, unit } = rateChangeParts(child.change);
	return (
		<StatusChip
			className="h-auto min-h-[22px] items-start whitespace-normal py-[3px]"
			glyph={child.tile.glyph}
			tone={child.tile.tone}
		>
			<span className="max-w-[45%] shrink-0 truncate">
				{child.change.label}
			</span>
			<span className="min-w-0 font-[450] text-tertiary-foreground [overflow-wrap:anywhere]">
				{from !== null && (
					<>
						<span className="text-subtle line-through">{from}</span>{" "}
						<span className="text-subtle">→</span>{" "}
					</>
				)}
				<span className="font-medium text-foreground">{to}</span>
				{unit}
			</span>
		</StatusChip>
	);
}
