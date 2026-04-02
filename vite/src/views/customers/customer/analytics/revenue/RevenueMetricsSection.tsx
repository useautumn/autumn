import { CurrencyCircleDollarIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/v2/badges/Badge";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
import {
	useArpc,
	useCustomerLeaderboard,
	useEstimatedMrr,
	useInvoiceStatus,
	useRevenueByProduct,
	useRevenueProductShare,
} from "../hooks/useRevenueAnalytics";
import { ArpcChart } from "./ArpcChart";
import { CustomerLeaderboardTable } from "./CustomerLeaderboardTable";
import { EstimatedMrrCard } from "./EstimatedMrrCard";
import { InvoiceStatusChart } from "./InvoiceStatusChart";
import { RevenueByProductChart } from "./RevenueByProductChart";
import { RevenueProductShareChart } from "./RevenueProductShareChart";

const RevenueMetricsMaintenance = () => (
	<div className="flex flex-col gap-4 pb-6">
		<div className="flex justify-between h-10">
			<div className="text-t3 text-md flex gap-2 items-center">
				<CurrencyCircleDollarIcon
					size={16}
					weight="fill"
					className="text-subtle"
				/>
				Revenue
				<Badge variant="muted" className="text-[10px] px-1.5 py-0">
					Beta
				</Badge>
			</div>
		</div>
		<div className="flex flex-col items-center justify-center gap-3 py-12 rounded-lg border border-border bg-muted/30 text-center animate-in fade-in-0 duration-300">
			<div className="flex items-center justify-center size-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
				<WarningIcon size={20} weight="fill" className="text-amber-500" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-t1">
					Revenue metrics under maintenance
				</p>
				<p className="text-xs text-t3 max-w-xs">
					This section is temporarily unavailable.
				</p>
			</div>
		</div>
	</div>
);

export const RevenueMetricsSection = () => {
	const env = useEnv();
	const { flags } = useFeatureFlags();

	const [granularity, setGranularity] = useState<"day" | "month" | "year">(
		"month",
	);

	const revenueByProduct = useRevenueByProduct({ granularity });
	const productShare = useRevenueProductShare();
	const arpc = useArpc();
	const invoiceStatus = useInvoiceStatus();
	const leaderboard = useCustomerLeaderboard();
	const estimatedMrr = useEstimatedMrr();

	if (env !== "live") return null;

	if (flags.maintenanceModes.analytics.disableRevenueMetrics) {
		return <RevenueMetricsMaintenance />;
	}

	return (
		<div className="flex flex-col gap-4 pb-6">
			<div className="flex justify-between h-10">
				<div className="text-t3 text-md flex gap-2 items-center">
					<CurrencyCircleDollarIcon
						size={16}
						weight="fill"
						className="text-subtle"
					/>
					Revenue
					<Badge variant="muted" className="text-[10px] px-1.5 py-0">
						Beta
					</Badge>
				</div>
				<span className="text-xs text-t4 flex items-center">
					Invoice data may be incomplete, and may be up to 24 hours behind.
				</span>
			</div>

			<EstimatedMrrCard
				data={estimatedMrr.data}
				loading={estimatedMrr.isLoading}
			/>

			<RevenueByProductChart
				data={revenueByProduct.data ?? []}
				loading={revenueByProduct.isLoading}
				granularity={granularity}
				setGranularity={setGranularity}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<RevenueProductShareChart
					data={productShare.data ?? []}
					loading={productShare.isLoading}
				/>
				<InvoiceStatusChart
					data={invoiceStatus.data ?? []}
					loading={invoiceStatus.isLoading}
				/>
			</div>

			<ArpcChart data={arpc.data ?? []} loading={arpc.isLoading} />

			<CustomerLeaderboardTable
				data={leaderboard.data?.rows ?? []}
				totalRevenue={leaderboard.data?.total_revenue ?? 0}
				loading={leaderboard.isLoading}
			/>
		</div>
	);
};
