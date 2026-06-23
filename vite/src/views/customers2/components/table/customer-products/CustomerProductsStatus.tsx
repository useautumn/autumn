import { CusProductStatus, formatMsToDate } from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import { DotIcon } from "@phosphor-icons/react";
import { formatDistance } from "date-fns";
import {
	AlertTriangleIcon,
	BanIcon,
	CalendarIcon,
	CheckIcon,
	ClockIcon,
	PauseIcon,
	XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusConfig = {
	icon: React.ElementType;
	label: string;
	iconClassName: string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
	active: {
		icon: CheckIcon,
		label: "Active",
		iconClassName: "bg-green-500 dark:bg-green-600",
	},
	trialing: {
		icon: ClockIcon,
		label: "Trial",
		iconClassName: "bg-blue-500 dark:bg-blue-600",
	},
	paused: {
		icon: PauseIcon,
		label: "Paused",
		iconClassName: "bg-yellow-500 dark:bg-yellow-600 fill-white",
	},
	canceling: {
		icon: BanIcon,
		label: "Cancelling",
		iconClassName: "bg-orange-500 dark:bg-orange-600",
	},
	past_due: {
		icon: AlertTriangleIcon,
		label: "Past Due",
		iconClassName: "bg-red-500 dark:bg-red-600",
	},
	expired: {
		icon: XIcon,
		label: "Expired",
		iconClassName: "bg-black dark:bg-black",
	},
	scheduled: {
		icon: CalendarIcon,
		label: "Scheduled",
		iconClassName: "bg-purple-500 dark:bg-purple-600",
	},
};

function resolveStatus({
	status,
	canceled,
	trialing,
}: {
	status?: CusProductStatus;
	canceled?: boolean;
	trialing?: boolean;
}): string {
	if (status === CusProductStatus.Paused) return "paused";
	if (status === CusProductStatus.Expired) return "expired";
	if (status === CusProductStatus.Scheduled) return "scheduled";
	if (canceled) return "canceling";
	if (trialing || status === CusProductStatus.Trialing) return "trialing";
	if (status === CusProductStatus.PastDue) return "past_due";
	return "active";
}

function getSubtext({
	resolvedStatus,
	trial_ends_at,
	canceled_at,
	starts_at,
	nowMs,
}: {
	resolvedStatus: string;
	trial_ends_at?: number;
	canceled_at?: number;
	starts_at?: number;
	nowMs: number;
}): string | null {
	if (resolvedStatus === "trialing" && trial_ends_at) {
		return `${formatDistance(trial_ends_at, nowMs)} left`;
	}
	if (resolvedStatus === "canceling" && canceled_at) {
		return `${formatDistance(canceled_at, nowMs)} ago`;
	}
	if (resolvedStatus === "scheduled" && starts_at) {
		return `Starts ${formatMsToDate(starts_at)}`;
	}
	return null;
}

function StatusIcon({
	icon: Icon,
	className,
}: {
	icon: React.ElementType;
	className: string;
}) {
	return (
		<Icon
			className={cn("text-white rounded-full p-0.5", className)}
			size={12}
		/>
	);
}

export function CustomerProductsStatus({
	tooltip,
	status,
	canceled,
	canceled_at,
	trialing,
	trial_ends_at,
	starts_at,
	nowMs,
}: {
	status?: CusProductStatus;
	tooltip?: boolean;
	canceled?: boolean;
	canceled_at?: number;
	trialing?: boolean;
	trial_ends_at?: number;
	starts_at?: number;
	nowMs?: number;
}) {
	const effectiveNowMs = nowMs ?? Date.now();
	const resolvedStatus = resolveStatus({ status, canceled, trialing });
	const config = STATUS_CONFIG[resolvedStatus];

	if (!config) return <div>Unknown</div>;

	const subtext = getSubtext({
		resolvedStatus,
		trial_ends_at,
		canceled_at,
		starts_at,
		nowMs: effectiveNowMs,
	});

	const iconElement = (
		<StatusIcon icon={config.icon} className={config.iconClassName} />
	);

	if (tooltip) {
		return (
			<div className="flex items-center">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>{iconElement}</TooltipTrigger>
						<TooltipContent>
							<span className="text-sm">{config.label} </span>
							{subtext && (
								<span className="text-sm text-tertiary-foreground">
									({subtext})
								</span>
							)}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		);
	}

	return (
		<div className="flex items-center">
			<div className="flex items-center gap-1.5">
				{iconElement}
				<span className="text-sm">{config.label}</span>
			</div>
			{subtext && (
				<>
					<DotIcon size={16} />
					<span className="text-sm text-tertiary-foreground pl-1 truncate">
						{subtext}
					</span>
				</>
			)}
		</div>
	);
}
