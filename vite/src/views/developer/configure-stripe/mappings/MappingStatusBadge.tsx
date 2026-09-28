import type { CatalogStripeMapping } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";

const statusConfig = {
	ok: { label: "Verified", tone: "green", glyph: "check" },
	unmapped: { label: "Unmapped", tone: "neutral", glyph: "dashed" },
	unchecked: { label: "Unchecked", tone: "neutral", glyph: "refresh" },
	missing: { label: "Missing", tone: "red", glyph: "alert" },
	inactive: { label: "Inactive", tone: "amber", glyph: "alert" },
	conflict: { label: "Mixed", tone: "amber", glyph: "alert" },
} satisfies Record<
	CatalogStripeMapping["status"],
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
>;

export const MappingStatusBadge = ({
	status,
	className,
}: {
	status: CatalogStripeMapping["status"];
	className?: string;
}) => {
	const { label, tone, glyph } = statusConfig[status];

	return (
		<StatusChip className={className} tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
};
