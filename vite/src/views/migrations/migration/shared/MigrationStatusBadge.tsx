import type { MigrationStatus } from "@autumn/shared";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockIcon,
	type Icon,
	PencilSimpleIcon,
	PlayCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { statusLabel, waitingExplanation } from "./migrationStatus";

const STATUS_STYLES: Record<MigrationStatus, string> = {
	draft: "bg-muted text-tertiary-foreground border-transparent",
	waiting: "bg-yellow-500/10 text-yellow-500 border-transparent",
	running: "bg-green-500/10 text-green-500 border-transparent",
	run: "bg-blue-500/10 text-blue-500 border-transparent",
};

const STATUS_ICONS: Record<MigrationStatus, Icon> = {
	draft: PencilSimpleIcon,
	waiting: ClockIcon,
	running: PlayCircleIcon,
	run: CheckCircleIcon,
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
