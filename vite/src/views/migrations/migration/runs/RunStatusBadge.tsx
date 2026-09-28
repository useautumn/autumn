import type { MigrationItemRunSkipReason } from "@autumn/shared";
import { NEUTRAL_STATUS_ICON_CLASS, StatusChip } from "@autumn/ui";
import { CheckIcon, type Icon, MinusIcon, XIcon } from "@phosphor-icons/react";
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

const LIVE_ICON_CLASSES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-green-500",
	skipped: NEUTRAL_STATUS_ICON_CLASS,
	failed: "bg-red-500",
};

const DRY_ICON_CLASSES: Record<MigrationItemEventStatus, string> = {
	succeeded: "bg-blue-500",
	skipped: NEUTRAL_STATUS_ICON_CLASS,
	failed: "bg-orange-500",
};

const STATUS_LABELS: Record<MigrationItemEventStatus, string> = {
	succeeded: "Passed",
	skipped: "Skipped",
	failed: "Failed",
};

const STATUS_ICONS: Record<MigrationItemEventStatus, Icon> = {
	succeeded: CheckIcon,
	skipped: MinusIcon,
	failed: XIcon,
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
	const StatusIcon = STATUS_ICONS[status];
	const iconClassName = (dryRun ? DRY_ICON_CLASSES : LIVE_ICON_CLASSES)[status];
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
			icon={<StatusIcon weight="bold" />}
			iconClassName={iconClassName}
		>
			{label}
		</StatusChip>
	);
}
