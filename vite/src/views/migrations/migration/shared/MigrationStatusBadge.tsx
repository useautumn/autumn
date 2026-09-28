import type { MigrationStatus } from "@autumn/shared";
import {
	StatusChip,
	StatusChipIcon,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import {
	CheckIcon,
	ClockIcon,
	type Icon,
	MinusIcon,
	PencilSimpleIcon,
	PlayIcon,
	ProhibitIcon,
	XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { statusLabel, waitingExplanation } from "./migrationStatus";

const NEUTRAL_ICON_CLASS = "bg-zinc-400 dark:bg-zinc-500";

const STATUS_ICON_CLASSES: Record<MigrationStatus, string> = {
	draft: NEUTRAL_ICON_CLASS,
	waiting: "bg-yellow-500",
	running: "bg-green-500",
	run: "bg-blue-500",
	no_changes: NEUTRAL_ICON_CLASS,
	failed: "bg-red-500",
	canceled: NEUTRAL_ICON_CLASS,
};

const STATUS_ICONS: Record<MigrationStatus, Icon> = {
	draft: PencilSimpleIcon,
	waiting: ClockIcon,
	running: PlayIcon,
	run: CheckIcon,
	no_changes: MinusIcon,
	failed: XIcon,
	canceled: ProhibitIcon,
};

export function MigrationStatusBadge({
	status,
	blockedBy,
	labelBlocker = true,
	className,
}: {
	status: MigrationStatus;
	blockedBy: string | null;
	labelBlocker?: boolean;
	className?: string;
}) {
	const StatusIcon = STATUS_ICONS[status];
	const badge = (
		<StatusChip
			tabIndex={status === "waiting" ? 0 : undefined}
			className={cn("max-w-56", className)}
			indicator={
				<StatusChipIcon
					icon={<StatusIcon weight="bold" />}
					className={STATUS_ICON_CLASSES[status]}
				/>
			}
		>
			<span className="truncate">
				{statusLabel({ status, blockedBy: labelBlocker ? blockedBy : null })}
			</span>
		</StatusChip>
	);
	if (status !== "waiting") return badge;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{badge}</TooltipTrigger>
			<TooltipContent className="max-w-64">
				{waitingExplanation(blockedBy)}
			</TooltipContent>
		</Tooltip>
	);
}
