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
import {
	type MigrationStatusBadgeSpec,
	statusBadge,
	waitingExplanation,
} from "./migrationStatus";

const TONE_STYLES: Record<MigrationStatusBadgeSpec["tone"], string> = {
	draft: "bg-muted text-tertiary-foreground border-transparent",
	waiting: "bg-yellow-500/10 text-yellow-500 border-transparent",
	running: "bg-green-500/10 text-green-500 border-transparent",
	run: "bg-blue-500/10 text-blue-500 border-transparent",
};

const TONE_ICONS: Record<MigrationStatusBadgeSpec["tone"], Icon> = {
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
	/** Off where the column is narrow; the tooltip still names the blocker. */
	labelBlocker?: boolean;
	className?: string;
}) {
	const spec = statusBadge({
		status,
		blockedBy: labelBlocker ? blockedBy : null,
	});
	const ToneIcon = TONE_ICONS[spec.tone];
	const badge = (
		<Badge
			variant="muted"
			tabIndex={status === "waiting" ? 0 : undefined}
			className={cn(
				"max-w-56 gap-1 whitespace-nowrap",
				TONE_STYLES[spec.tone],
				className,
			)}
		>
			<ToneIcon size={12} weight="fill" className="shrink-0" />
			<span className="truncate">{spec.label}</span>
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
