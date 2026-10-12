import { cn } from "@autumn/ui/lib/utils";
import type { RateChange } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { RateChangeRow } from "./RateChangeRow";

/** Rate card rows nested under the plan item whose feature override sets them. */
export function RateChangeList({
	changes,
	className,
}: {
	changes: RateChange[];
	className?: string;
}) {
	if (changes.length === 0) return null;
	return (
		<div
			className={cn(
				"flex flex-col gap-0.5 ml-1.5 pl-3 border-l border-border",
				className,
			)}
		>
			{changes.map((change) => (
				<RateChangeRow change={change} key={change.key} />
			))}
		</div>
	);
}
