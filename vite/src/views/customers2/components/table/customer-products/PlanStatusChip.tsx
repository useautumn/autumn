import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";
import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import { differenceInCalendarDays, format, formatDistance } from "date-fns";
import { cn } from "@/lib/utils";
import { PlanStatusIcon } from "./PlanStatusIcon";
import { PLAN_STATUS_CONFIG } from "./planStatusConfig";
import { type PlanStatus, resolvePlanStatus } from "./resolvePlanStatus";

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
		const daysLeftText =
			daysLeft > 0
				? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
				: "ends today";
		const trialStartedAt = starts_at ?? customerProduct.created_at;
		return {
			shortText: daysLeft > 0 ? `${daysLeft}d left` : "Ends today",
			tooltipText: `Trial ends ${format(trial_ends_at, LONG_DATE)} · ${daysLeftText}`,
			tooltipSubtext: trialStartedAt
				? `Started ${format(trialStartedAt, LONG_DATE)}`
				: undefined,
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

	const { label } = PLAN_STATUS_CONFIG[planStatus];
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
	const { label } = PLAN_STATUS_CONFIG[planStatus];
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
					<StatusChip
						indicator={<PlanStatusIcon planStatus={planStatus} />}
						dashed={isPending}
						className={cn(isExpired && "bg-transparent", className)}
					>
						{showsName && (
							<span
								className={cn(
									"truncate",
									isExpired && "text-subtle line-through",
								)}
							>
								{customerProduct.product.name}
								{quantity > 1 && (
									<span className="text-tertiary-foreground"> ×{quantity}</span>
								)}
							</span>
						)}
						{showsLabel && <span className="shrink-0">{label}</span>}
						{showsDetail && (
							<span className="shrink-0 font-normal text-tertiary-foreground">
								· {detailText}
							</span>
						)}
					</StatusChip>
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
