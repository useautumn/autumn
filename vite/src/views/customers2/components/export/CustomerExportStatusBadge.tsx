import type { CustomerExportResponse } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockClockwiseIcon,
	type Icon,
	SpinnerIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
	queued: {
		label: "Queued",
		icon: ClockClockwiseIcon,
		className: "bg-muted text-tertiary-foreground border-border/50",
		iconClassName: "",
	},
	running: {
		label: "Running",
		icon: SpinnerIcon,
		className: "bg-amber-500/10 text-amber-500 border-transparent",
		iconClassName: "animate-spin",
	},
	completed: {
		label: "Completed",
		icon: CheckCircleIcon,
		className: "bg-green-500/10 text-green-500 border-transparent",
		iconClassName: "",
	},
	failed: {
		label: "Failed",
		icon: XCircleIcon,
		className: "bg-red-500/10 text-red-500 border-transparent",
		iconClassName: "",
	},
} satisfies Record<
	CustomerExportResponse["status"],
	{ label: string; icon: Icon; className: string; iconClassName: string }
>;

export function CustomerExportStatusBadge({
	status,
}: {
	status: CustomerExportResponse["status"];
}) {
	const config = STATUS_CONFIG[status];
	const StatusIcon = config.icon;

	return (
		<Badge variant="muted" size="sm" className={cn("gap-1", config.className)}>
			<StatusIcon size={11} weight="fill" className={config.iconClassName} />
			{config.label}
		</Badge>
	);
}
