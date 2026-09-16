import type { MigrationItemRunSkipReason } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	CheckCircleIcon,
	type Icon,
	MinusCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
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

const LIVE_STYLES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-green-500/10 text-green-500 border-transparent",
	skipped: "bg-muted text-muted-foreground border-transparent",
	failed: "bg-red-500/10 text-red-500 border-transparent",
};

const DRY_STYLES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-blue-500/10 text-blue-500 border-blue-500/30 border-dashed",
	skipped: "bg-muted text-muted-foreground border-border border-dashed",
	failed: "bg-orange-500/10 text-orange-500 border-orange-500/30 border-dashed",
};

const STATUS_LABELS: Record<MigrationItemEventStatus, string> = {
	succeeded: "Passed",
	skipped: "Skipped",
	failed: "Failed",
};

const STATUS_ICONS: Record<MigrationItemEventStatus, Icon> = {
	succeeded: CheckCircleIcon,
	skipped: MinusCircleIcon,
	failed: XCircleIcon,
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
	/** From the item run row; falls back to the event response. */
	skipReason?: MigrationItemRunSkipReason | null;
}) {
	if (status === "skipped") {
		const spec = skipBadgeSpec({
			skipReason: skipReason ?? skipReasonFromResponse(response),
			response,
		});
		const styles = dryRun ? DRY_STYLES : LIVE_STYLES;
		return (
			<Badge
				variant="muted"
				className={cn(
					"gap-1",
					spec.noChanges
						? cn(
								"bg-muted text-tertiary-foreground",
								dryRun ? "border-border border-dashed" : "border-transparent",
							)
						: styles.skipped,
				)}
			>
				<MinusCircleIcon size={12} weight="fill" />
				{spec.label}
			</Badge>
		);
	}

	const StatusIcon = STATUS_ICONS[status];

	return (
		<Badge
			variant="muted"
			className={cn("gap-1", (dryRun ? DRY_STYLES : LIVE_STYLES)[status])}
		>
			<StatusIcon size={12} weight="fill" />
			{STATUS_LABELS[status]}
		</Badge>
	);
}
