import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import type { StripeItemMark } from "./previewMismatches";
import { StripeItemMatchIcon } from "./StripeItemMatchIcon";
import type { DisplayItem } from "./syncPhaseSections";

export const STRIPE_ROW_CLASS = cn(
	"flex min-h-9 min-w-0 items-center gap-2 px-3 text-sm",
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
);

/** Fixed slot so match icons line up with the header's leading icon. */
export const STRIPE_ICON_LANE_CLASS = "flex w-3.5 shrink-0 justify-center";

export function StripeItemRow({
	item,
	mark,
}: {
	item: DisplayItem;
	mark: StripeItemMark | undefined;
}) {
	return (
		<div className={STRIPE_ROW_CLASS}>
			<span className={STRIPE_ICON_LANE_CLASS}>
				<StripeItemMatchIcon mark={mark} />
			</span>
			<span className="min-w-0 flex-1 truncate text-foreground">
				{item.name}
			</span>
			<span className="shrink-0 tabular-nums text-tertiary-foreground">
				{item.priceLabel}
			</span>
		</div>
	);
}
