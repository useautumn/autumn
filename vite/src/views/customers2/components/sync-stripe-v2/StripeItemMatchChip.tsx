import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
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

export function StripeItemMatchChip({
	mark,
}: {
	mark: StripeItemMark | undefined;
}) {
	if (!mark) return null;
	const { label, tone, glyph } = STRIPE_ITEM_MATCHES[mark];
	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
