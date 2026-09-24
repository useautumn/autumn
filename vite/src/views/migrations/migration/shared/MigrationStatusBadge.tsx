import type { MigrationStatus } from "@autumn/shared";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockIcon,
	type Icon,
	MinusCircleIcon,
	PencilSimpleIcon,
	PlayCircleIcon,
	ProhibitIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { statusLabel, waitingExplanation } from "./migrationStatus";

const STATUS_STYLES: Record<MigrationStatus, string> = {
	draft: "bg-muted text-tertiary-foreground border-border",
	waiting: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
	running: "bg-green-500/10 text-green-500 border-green-500/20",
	run: "bg-blue-500/10 text-blue-500 border-blue-500/20",
	no_changes: "bg-muted text-tertiary-foreground border-border",
	failed: "bg-red-500/10 text-red-500 border-red-500/20",
	canceled: "bg-muted text-tertiary-foreground border-border",
};

const STATUS_ICONS: Record<MigrationStatus, Icon> = {
	draft: PencilSimpleIcon,
	waiting: ClockIcon,
	running: PlayCircleIcon,
	run: CheckCircleIcon,
	no_changes: MinusCircleIcon,
	failed: XCircleIcon,
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
		<Badge
			variant="muted"
			tabIndex={status === "waiting" ? 0 : undefined}
			className={cn(
				"max-w-56 gap-1 whitespace-nowrap",
				STATUS_STYLES[status],
				className,
			)}
		>
			<StatusIcon size={12} weight="fill" className="shrink-0" />
			<span className="truncate">
				{statusLabel({ status, blockedBy: labelBlocker ? blockedBy : null })}
			</span>
		</Badge>
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
