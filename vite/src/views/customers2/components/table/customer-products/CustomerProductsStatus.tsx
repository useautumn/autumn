import { type CusProductStatus, formatMsToDate } from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import { DotIcon } from "@phosphor-icons/react";
import { formatDistance } from "date-fns";
import { PlanStatusIcon } from "./PlanStatusIcon";
import { PLAN_STATUS_CONFIG } from "./planStatusConfig";
import { resolvePlanStatus } from "./resolvePlanStatus";

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
	const resolvedStatus = resolvePlanStatus({ status, canceled, trialing });
	const config = PLAN_STATUS_CONFIG[resolvedStatus];

	const subtext = getSubtext({
		resolvedStatus,
		trial_ends_at,
		canceled_at,
		starts_at,
		nowMs: effectiveNowMs,
	});

	const iconElement = <PlanStatusIcon planStatus={resolvedStatus} />;

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
					<TooltipProvider>
						<Tooltip delayDuration={0}>
							<TooltipTrigger asChild>
								<span className="min-w-0 text-sm text-tertiary-foreground pl-1 truncate">
									{subtext}
								</span>
							</TooltipTrigger>
							<TooltipContent>{subtext}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</>
			)}
		</div>
	);
}
