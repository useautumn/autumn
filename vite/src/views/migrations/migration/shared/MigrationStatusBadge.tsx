import type { MigrationStatus } from "@autumn/shared";
import {
	StatusChip,
	type StatusGlyph,
	type StatusTone,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import { statusLabel, waitingExplanation } from "./migrationStatus";

const STATUS_INDICATORS: Record<
	MigrationStatus,
	{ tone: StatusTone; glyph: StatusGlyph }
> = {
	draft: { tone: "neutral", glyph: "pencil" },
	waiting: { tone: "yellow", glyph: "clock" },
	running: { tone: "green", glyph: "play" },
	run: { tone: "blue", glyph: "check" },
	no_changes: { tone: "neutral", glyph: "minus" },
	failed: { tone: "red", glyph: "x" },
	canceled: { tone: "neutral", glyph: "ban" },
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
