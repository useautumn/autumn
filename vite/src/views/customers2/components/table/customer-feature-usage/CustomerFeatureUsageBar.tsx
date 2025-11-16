import { cn } from "@/lib/utils";
import { calculateUsageMetrics } from "./calculateUsageMetrics";

const getUsageBarColor = (percentage: number): string => {
	if (percentage >= 90) return "bg-red-500 dark:bg-red-600";
	if (percentage >= 80) return "bg-orange-500 dark:bg-orange-600";
	if (percentage >= 50) return "bg-yellow-500 dark:bg-yellow-600";
	return "bg-green-600 dark:bg-gray-600";
};

export function CustomerFeatureUsageBar({
	allowance,
	balance,
	quantity,
	horizontal = false,
}: {
	allowance: number;
	balance: number;
	quantity: number;
	horizontal?: boolean;
}): React.ReactNode {
	const { percentage } = calculateUsageMetrics({
		allowance,
		balance,
		quantity,
	});

	const barColor = getUsageBarColor(percentage);
	let displayPercentage = Math.min(percentage, 100);
	const balanceDisplayPercentage = 100 - displayPercentage;

	if (displayPercentage < 0) {
		displayPercentage = displayPercentage * -1;
	}

	return (
		<div
			className={cn(
				"w-0.5 h-full rounded-full bg-gray-200 dark:bg-gray-700 flex items-end overflow-hidden",
				// "w-0.5 h-full rounded-full flex items-end overflow-hidden",
				horizontal ? "w-28 h-1 justify-start" : "",
			)}
		>
			<div
				className={cn("w-full", barColor, horizontal ? "h-full" : "")}
				style={
					horizontal
						? { width: `${balanceDisplayPercentage}%` }
						: { height: `${balanceDisplayPercentage}%` }
				}
			/>
		</div>
	);
}
