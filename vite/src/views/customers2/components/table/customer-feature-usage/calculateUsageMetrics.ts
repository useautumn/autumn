export const calculateUsageMetrics = ({
	allowance,
	balance,
	quantity,
}: {
	allowance: number;
	balance: number;
	quantity: number;
}): {
	total: number;
	remaining: number;
	used: number;
	percentage: number;
} => {
	const total = allowance * quantity;
	const remaining = balance;
	const used = total - remaining;
	const percentage = total !== 0 ? (used / total) * 100 : 0;
	return { total, remaining, used, percentage };
};
