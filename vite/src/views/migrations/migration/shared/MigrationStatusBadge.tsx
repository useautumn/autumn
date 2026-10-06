import type { MigrationStatus } from "@autumn/shared";
import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import {
	STATUS_INDICATORS,
	statusLabel,
	waitingExplanation,
} from "./migrationStatus";

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
	const badge = (
		<StatusChip
			tabIndex={status === "waiting" ? 0 : undefined}
			className={cn("max-w-56", className)}
			{...STATUS_INDICATORS[status]}
		>
			{statusLabel({ status, blockedBy: labelBlocker ? blockedBy : null })}
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
