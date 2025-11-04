import { cn } from "@/lib/utils";
import { calculateUsageMetrics } from "./calculateUsageMetrics";

const getUsageBarColor = (percentage: number): string => {
	if (percentage >= 95) return "bg-red-500 dark:bg-red-600";
	if (percentage >= 80) return "bg-orange-500 dark:bg-orange-600";
	if (percentage >= 50) return "bg-yellow-500 dark:bg-yellow-600";
	return "bg-gray-400 dark:bg-gray-600";
};

export function CustomerFeatureUsageBar({
	allowance,
	balance,
	quantity,
}: {
	allowance: number;
	balance: number;
	quantity: number;
}): React.ReactNode {
	const { percentage } = calculateUsageMetrics({
		allowance,
		balance,
		quantity,
	});
	const barColor = getUsageBarColor(percentage);
	let displayPercentage = Math.min(percentage, 100);
	if (displayPercentage < 0) {
		displayPercentage = displayPercentage * -1;
	}

	return (
		<div className="w-0.5 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex flex-col justify-end overflow-hidden">
			<div
				className={cn("w-full", barColor)}
				style={{ height: `${displayPercentage}%` }}
			/>
		</div>
	);
}
