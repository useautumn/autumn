import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
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
					<ArrowsClockwiseIcon size={20} className="text-t3" />
				</div>
				<div>
					<Tooltip>
						<TooltipTrigger asChild>
							<p className="text-xs text-t3 cursor-help w-fit">
								Monthly Recurring Revenue
							</p>
						</TooltipTrigger>
						<TooltipContent>Estimated value</TooltipContent>
					</Tooltip>
					{loading ? (
						<div className="h-6 w-24 animate-pulse rounded bg-border mt-0.5" />
					) : (
						<p className="text-lg font-semibold text-t1 tabular-nums">
							{formatCurrency({
								value: data?.estimated_mrr ?? 0,
								currency: data?.currency ?? "usd",
							})}
							<span className="text-xs font-normal text-t4 ml-1">/mo</span>
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
						<p className="text-lg font-semibold text-t2 tabular-nums">
							{data?.active_subscriptions ?? 0}
						</p>
						<p className="text-xs text-t4">active cus products</p>
					</>
				)}
			</div>
		</div>
	);
};
