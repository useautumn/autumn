interface UsageMetrics {
	total: number;
	remaining: number;
	used: number;
	percentage: number;
}

const getUsagePercentage = (used: number, total: number): number => {
	if (total === 0) return 0;
	return (used / total) * 100;
};

export const calculateUsageMetrics = ({
	allowance,
	balance,
	quantity,
}: {
	allowance: number;
	balance: number;
	quantity: number;
}): UsageMetrics => {
	const total = allowance * quantity;
	const remaining = balance;
	const used = total - remaining;
	const percentage = getUsagePercentage(used, total);
	return { total, remaining, used, percentage };
};
