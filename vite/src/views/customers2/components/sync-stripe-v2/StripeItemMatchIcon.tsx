import {
	StatusChipIcon,
	type StatusGlyph,
	type StatusTone,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import type { StripeItemMark } from "./previewMismatches";

const STRIPE_ITEM_MATCHES: Record<
	StripeItemMark,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	linked: { label: "Matched", tone: "green", glyph: "check" },
	links_on_sync: {
		label: "Matched after sync",
		tone: "blue",
		glyph: "refresh",
	},
	out_of_sync: { label: "Not matched", tone: "amber", glyph: "alert" },
};

export function StripeItemMatchIcon({
	mark,
	tooltip,
}: {
	mark: StripeItemMark | undefined;
	tooltip?: string;
}) {
	if (!mark) return null;
	const { label, tone, glyph } = STRIPE_ITEM_MATCHES[mark];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex">
					<StatusChipIcon tone={tone} glyph={glyph} />
				</span>
			</TooltipTrigger>
			<TooltipContent>{tooltip ?? label}</TooltipContent>
		</Tooltip>
	);
}
