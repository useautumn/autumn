import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import { differenceInCalendarDays, format, formatDistance } from "date-fns";
import {
	AlertTriangleIcon,
	BanIcon,
	CalendarIcon,
	CheckIcon,
	ClockIcon,
	HourglassIcon,
	PauseIcon,
	XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type PlanStatus, resolvePlanStatus } from "./resolvePlanStatus";

type ChipStyle = {
	icon: React.ElementType;
	label: string;
	toneClassName: string;
};

const CHIP_STYLES: Record<PlanStatus, ChipStyle> = {
	active: {
		icon: CheckIcon,
		label: "Active",
		toneClassName: "text-green-600 dark:text-green-500",
	},
	trialing: {
		icon: ClockIcon,
		label: "Trial",
		toneClassName: "text-blue-600 dark:text-blue-400",
	},
	canceling: {
		icon: BanIcon,
		label: "Cancelling",
		toneClassName: "text-orange-600 dark:text-orange-400",
	},
	past_due: {
		icon: AlertTriangleIcon,
		label: "Past due",
		toneClassName: "text-red-600 dark:text-red-400",
	},
	scheduled: {
		icon: CalendarIcon,
		label: "Scheduled",
		toneClassName: "text-purple-600 dark:text-purple-400",
	},
	paused: {
		icon: PauseIcon,
		label: "Paused",
		toneClassName: "text-yellow-600 dark:text-yellow-400",
	},
	expired: {
		icon: XIcon,
		label: "Expired",
		toneClassName: "text-subtle",
	},
	pending: {
		icon: HourglassIcon,
		label: "Pending",
		toneClassName: "text-tertiary-foreground",
	},
};

const SHORT_DATE = "d MMM";
const LONG_DATE = "d MMM yyyy";

type StatusDetail = {
	shortText: string | null;
	tooltipText: string;
	tooltipSubtext?: string;
};

/** Short text sits inside the chip; the tooltip carries the full date. */
function getStatusDetail({
	planStatus,
	customerProduct,
	nowMs,
}: {
	planStatus: PlanStatus;
	customerProduct: FullCusProduct;
	nowMs: number;
}): StatusDetail {
	const { trial_ends_at, ended_at, starts_at, canceled_at } = customerProduct;

	if (planStatus === "trialing" && trial_ends_at) {
		const daysLeft = differenceInCalendarDays(trial_ends_at, nowMs);
		return {
			shortText: daysLeft > 0 ? `${daysLeft}d left` : "Ends today",
			tooltipText: `Trial ends ${format(trial_ends_at, LONG_DATE)}`,
		};
	}
	if (planStatus === "canceling") {
		const tooltipSubtext = canceled_at
			? `Cancelled ${formatDistance(canceled_at, nowMs)} ago`
			: undefined;
		if (!ended_at) {
			return {
				shortText: "Cancelling",
				tooltipText: "Cancelling",
				tooltipSubtext,
			};
		}
		return {
			shortText: `Ends ${format(ended_at, SHORT_DATE)}`,
			tooltipText: `Ends ${format(ended_at, LONG_DATE)}`,
			tooltipSubtext,
		};
	}
	if (planStatus === "scheduled" && starts_at) {
		return {
			shortText: format(starts_at, SHORT_DATE),
			tooltipText: `Starts ${format(starts_at, LONG_DATE)}`,
		};
	}
	if (planStatus === "expired" && ended_at) {
		return {
			shortText: null,
			tooltipText: `Expired ${format(ended_at, LONG_DATE)}`,
		};
	}

	const { label } = CHIP_STYLES[planStatus];
	const showsLabel = planStatus !== "active" && planStatus !== "expired";
	return { shortText: showsLabel ? label : null, tooltipText: label };
}

/** "icon" hides the status text; "status" drops the plan name for tables that show it elsewhere. */
type ChipDisplay = "full" | "icon" | "status";

export function PlanStatusChip({
	customerProduct,
	nowMs = Date.now(),
	display = "full",
	className,
}: {
	customerProduct: FullCusProduct;
	nowMs?: number;
	display?: ChipDisplay;
	className?: string;
}) {
	const planStatus = resolvePlanStatus({
		status: customerProduct.status,
		canceled: customerProduct.canceled,
		trialing: Boolean(isCustomerProductTrialing(customerProduct, { nowMs })),
	});
	const { icon: Icon, label, toneClassName } = CHIP_STYLES[planStatus];
	const { shortText, tooltipText, tooltipSubtext } = getStatusDetail({
		planStatus,
		customerProduct,
		nowMs,
	});

	const quantity = customerProduct.quantity ?? 1;
	const isExpired = planStatus === "expired";
	const isPending = planStatus === "pending";
	const showsName = display !== "status";
	const showsLabel = display === "status";
	const detailText = showsLabel && shortText === label ? null : shortText;
	const showsDetail = display !== "icon" && Boolean(detailText);

	return (
		<TooltipProvider>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<div
						className={cn(
							"inline-flex h-[22px] min-w-0 max-w-full items-center rounded-[5px] border border-border bg-background text-xs font-medium",
							isExpired && "bg-transparent",
							isPending && "border-dashed",
							className,
						)}
					>
						<span
							className={cn(
								"flex h-full shrink-0 items-center gap-1 px-1.5",
								showsName && "border-r border-inherit",
								isPending && "border-dashed",
								toneClassName,
							)}
						>
							<Icon className="size-3" strokeWidth={2.25} />
							{showsLabel && <span>{label}</span>}
							{showsDetail && (
								<span
									className={cn(
										showsLabel && "font-normal text-tertiary-foreground",
									)}
								>
									{showsLabel ? `· ${detailText}` : detailText}
								</span>
							)}
						</span>
						{showsName && (
							<span
								className={cn(
									"truncate px-[7px] text-foreground",
									isExpired && "text-subtle line-through",
								)}
							>
								{customerProduct.product.name}
								{quantity > 1 && (
									<span className="text-tertiary-foreground"> ×{quantity}</span>
								)}
							</span>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					<div>{tooltipText}</div>
					{tooltipSubtext && (
						<div className="text-tertiary-foreground">{tooltipSubtext}</div>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
