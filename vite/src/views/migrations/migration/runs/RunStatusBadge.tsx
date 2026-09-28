import type { MigrationItemRunSkipReason } from "@autumn/shared";
import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
import type { MigrationItemEventStatus } from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";
import { skipBadgeSpec, skipReasonFromResponse } from "./skipBadge";

export function ActiveRunDot({ className }: { className?: string }) {
	return (
		<span className={cn("relative flex h-2.5 w-2.5 shrink-0", className)}>
			<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
			<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
		</span>
	);
}

const LIVE_TONES: Record<MigrationItemEventStatus, StatusTone> = {
	succeeded: "green",
	skipped: "neutral",
	failed: "red",
};

const DRY_TONES: Record<MigrationItemEventStatus, StatusTone> = {
	succeeded: "blue",
	skipped: "neutral",
	failed: "orange",
};

const STATUS_LABELS: Record<MigrationItemEventStatus, string> = {
	succeeded: "Passed",
	skipped: "Skipped",
	failed: "Failed",
};

const STATUS_GLYPHS: Record<MigrationItemEventStatus, StatusGlyph> = {
	succeeded: "check",
	skipped: "minus",
	failed: "x",
};

export function ItemEventStatusBadge({
	status,
	dryRun = false,
	response = null,
	skipReason,
}: {
	status: MigrationItemEventStatus;
	dryRun?: boolean;
	response?: Record<string, unknown> | null;
	skipReason?: MigrationItemRunSkipReason | null;
}) {
	const label =
		status === "skipped"
			? skipBadgeSpec({
					skipReason: skipReason ?? skipReasonFromResponse(response),
					response,
				}).label
			: STATUS_LABELS[status];

	return (
		<StatusChip
			dashed={dryRun}
			tone={(dryRun ? DRY_TONES : LIVE_TONES)[status]}
			glyph={STATUS_GLYPHS[status]}
		>
			{label}
		</StatusChip>
	);
}
