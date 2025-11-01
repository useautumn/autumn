import { cn } from "@/lib/utils";
import { calculateUsageMetrics } from "./calculateUsageMetrics";

const getUsageBarColor = (percentage: number): string => {
	if (percentage >= 95) return "bg-red-500";
	if (percentage >= 80) return "bg-orange-500";
	if (percentage >= 50) return "bg-yellow-500";
	return "bg-gray-400";
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
		<div className="w-0.5 h-8 rounded-full bg-gray-200 flex flex-col justify-end overflow-hidden">
			<div
				className={cn("w-full", barColor)}
				style={{ height: `${displayPercentage}%` }}
			/>
		</div>
	);
}
