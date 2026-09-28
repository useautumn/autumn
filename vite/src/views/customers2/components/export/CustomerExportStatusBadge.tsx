import type { CustomerExportResponse } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";

const STATUS_CONFIG = {
	queued: { label: "Queued", tone: "neutral", glyph: "refresh" },
	running: { label: "Running", tone: "amber", glyph: "spinner" },
	completed: { label: "Completed", tone: "green", glyph: "check" },
	failed: { label: "Failed", tone: "red", glyph: "x" },
} satisfies Record<
	CustomerExportResponse["status"],
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
>;

export function CustomerExportStatusBadge({
	status,
}: {
	status: CustomerExportResponse["status"];
}) {
	const { label, tone, glyph } = STATUS_CONFIG[status];

	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
