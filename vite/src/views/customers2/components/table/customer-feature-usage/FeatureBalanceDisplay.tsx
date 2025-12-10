import { FeatureUsageType } from "@autumn/shared";
import { cn } from "@/lib/utils";

export interface FeatureBalanceDisplayProps {
	allowance: number;
	balance: number;
	shouldShowOutOfBalance: boolean;
	shouldShowUsed: boolean;
	usageType?: string;
	className?: string;
	initialAllowance: number;
}

/**
 * Shared display component for feature balance/usage numbers
 */
export function FeatureBalanceDisplay({
	allowance,
	balance,
	shouldShowOutOfBalance,
	shouldShowUsed,
	usageType,
	className,
	initialAllowance,
}: FeatureBalanceDisplayProps) {
	const formatNumber = (num: number) => new Intl.NumberFormat().format(num);
	const displayBalance = balance < 0 ? 0 : balance;
	const overage = balance < 0 ? balance * -1 : 0;

	// console.log("initialAllowance", initialAllowance);

	const getUsedLabel = () => {
		//change for feather
		if (initialAllowance > 0) return "overage";
		if (usageType === FeatureUsageType.Continuous) return "in use";
		return "used";
	};

	return (
		<div className={cn("flex items-baseline gap-1 truncate", className)}>
			{shouldShowOutOfBalance && (
				<>
					<span className="text-t1">{formatNumber(displayBalance)}</span>
					{allowance > 0 && (
						<span className="text-t4">/{formatNumber(allowance)}</span>
					)}
				</>
			)}
			{shouldShowUsed && (
				<span className="truncate">
					{shouldShowOutOfBalance && shouldShowUsed && " +"}
					{formatNumber(overage)}{" "}
					<span className="text-t4 truncate">{getUsedLabel()}</span>
				</span>
			)}
		</div>
	);
}
