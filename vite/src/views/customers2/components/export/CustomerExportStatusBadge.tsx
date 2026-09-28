import type { CustomerExportResponse } from "@autumn/shared";
import { NEUTRAL_STATUS_ICON_CLASS, StatusChip } from "@autumn/ui";
import {
	CheckIcon,
	ClockClockwiseIcon,
	type Icon,
	SpinnerIcon,
	XIcon,
} from "@phosphor-icons/react";

const STATUS_CONFIG = {
	queued: {
		label: "Queued",
		icon: ClockClockwiseIcon,
		className: NEUTRAL_STATUS_ICON_CLASS,
		iconClassName: "",
	},
	running: {
		label: "Running",
		icon: SpinnerIcon,
		className: "bg-amber-500",
		iconClassName: "animate-spin",
	},
	completed: {
		label: "Completed",
		icon: CheckIcon,
		className: "bg-green-500",
		iconClassName: "",
	},
	failed: {
		label: "Failed",
		icon: XIcon,
		className: "bg-red-500",
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
		<StatusChip
			icon={<StatusIcon weight="bold" className={config.iconClassName} />}
			iconClassName={config.className}
		>
			{config.label}
		</StatusChip>
	);
}
