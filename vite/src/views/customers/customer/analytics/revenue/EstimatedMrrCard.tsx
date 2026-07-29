import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import type { EstimatedMrrResult } from "../hooks/useRevenueAnalytics";

const formatCurrency = ({
	value,
	currency,
}: {
	value: number;
	currency: string;
}) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
};

export const EstimatedMrrCard = ({
	data,
	loading,
}: {
	data?: EstimatedMrrResult;
	loading: boolean;
}) => {
	return (
		<div className="border rounded-lg bg-interactive-secondary px-5 py-4 flex items-center justify-between">
			<div className="flex items-center gap-3">
				<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
					<ArrowsClockwiseIcon size={20} className="text-tertiary-foreground" />
				</div>
				<div>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="text-xs text-tertiary-foreground cursor-help w-fit">
								Monthly Recurring Revenue
							</p>
						</TooltipTrigger>
						<TooltipContent>Estimated value</TooltipContent>
					</Tooltip>
					{loading ? (
						<div className="h-6 w-24 animate-pulse rounded bg-border mt-0.5" />
					) : (
						<p className="text-lg font-semibold text-foreground tabular-nums">
							{formatCurrency({
								value: data?.estimated_mrr ?? 0,
								currency: data?.currency ?? "usd",
							})}
							<span className="text-xs font-normal text-subtle ml-1">/mo</span>
						</p>
					)}
				</div>
			</div>
			<div className="text-right">
				{loading ? (
					<>
						<div className="h-6 w-10 animate-pulse rounded bg-border ml-auto" />
						<div className="h-3 w-16 animate-pulse rounded bg-border mt-1 ml-auto" />
					</>
				) : (
					<>
						<p className="text-lg font-semibold text-muted-foreground tabular-nums">
							{data?.active_subscriptions ?? 0}
						</p>
						<p className="text-xs text-subtle">active plans</p>
					</>
				)}
			</div>
		</div>
	);
};
