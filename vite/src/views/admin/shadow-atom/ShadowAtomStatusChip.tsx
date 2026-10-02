import { ByocCacheStatus } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";

const STATUS_DISPLAY: Record<
	ByocCacheStatus | "none",
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	none: { label: "Not deployed", tone: "neutral", glyph: "dashed" },
	[ByocCacheStatus.AwaitingSetup]: {
		label: "Awaiting setup",
		tone: "yellow",
		glyph: "hourglass",
	},
	[ByocCacheStatus.Provisioning]: {
		label: "Provisioning",
		tone: "blue",
		glyph: "spinner",
	},
	[ByocCacheStatus.Ready]: { label: "Ready", tone: "green", glyph: "check" },
	[ByocCacheStatus.Failed]: { label: "Failed", tone: "red", glyph: "x" },
};

export const ShadowAtomStatusChip = ({
	status,
}: {
	status: ByocCacheStatus | null;
}) => {
	const { label, tone, glyph } = STATUS_DISPLAY[status ?? "none"];
	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
};
