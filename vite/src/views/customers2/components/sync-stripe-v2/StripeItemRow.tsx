import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { StripeItemMark } from "./previewMismatches";
import { StripeItemMatchChip } from "./StripeItemMatchChip";
import type { DisplayItem } from "./syncPhaseSections";

export const STRIPE_ROW_CLASS = cn(
	"flex min-h-9 min-w-0 items-center gap-2 px-3 text-sm",
	TABLE_TRAY_SURFACE_ROW_CLASS,
);

export function StripeItemRow({
	item,
	mark,
}: {
	item: DisplayItem;
	mark: StripeItemMark | undefined;
}) {
	return (
		<div className={STRIPE_ROW_CLASS}>
			<span className="min-w-0 flex-1 truncate text-foreground">
				{item.name}
			</span>
			<StripeItemMatchChip mark={mark} />
			<span className="shrink-0 tabular-nums text-tertiary-foreground">
				{item.priceLabel}
			</span>
		</div>
	);
}
