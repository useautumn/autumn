import type { FullCustomer } from "@autumn/shared";
import { useFeatureUsageBalance } from "@/views/customers2/hooks/useFeatureUsageBalance";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";
import { FeatureBalanceDisplay } from "../customer-feature-usage/FeatureBalanceDisplay";

interface FeatureUsageCellProps {
	fullCustomer: FullCustomer | undefined;
	featureId: string;
	isLoading?: boolean;
}

/**
 * Displays feature usage balance and bar stacked vertically for use in the customer list table
 */
export function FeatureUsageCell({
	fullCustomer,
	featureId,
	isLoading = false,
}: FeatureUsageCellProps) {
	const {
		allowance,
		balance,
		shouldShowOutOfBalance,
		shouldShowUsed,
		isUnlimited,
		usageType,
		quantity,
		cusEntsCount,
		initialAllowance,
	} = useFeatureUsageBalance({
		fullCustomer,
		featureId,
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-1 w-full min-w-20 overflow-hidden">
				<div className="h-2 w-12 bg-secondary animate-pulse rounded mb-1" />
				<div className="h-1 w-full bg-secondary animate-pulse rounded-full animate-in slide-in-from-left ease-out duration-1000" />
			</div>
		);
	}

	if (!fullCustomer || cusEntsCount === 0) {
		return <span className="px-1"></span>;
	}

	if (isUnlimited) {
		return <span className="text-t3 text-tiny px-1">Unlimited</span>;
	}

	return (
		<div className="flex flex-col gap-1 w-full px-1">
			<FeatureBalanceDisplay
				allowance={allowance}
				initialAllowance={initialAllowance}
				balance={balance}
				shouldShowOutOfBalance={shouldShowOutOfBalance}
				shouldShowUsed={shouldShowUsed}
				usageType={usageType}
				className="text-tiny"
				compact={true}
			/>
			{allowance > 0 && (
				<CustomerFeatureUsageBar
					allowance={allowance}
					balance={balance}
					quantity={quantity}
					horizontal={true}
				/>
			)}
		</div>
	);
}
