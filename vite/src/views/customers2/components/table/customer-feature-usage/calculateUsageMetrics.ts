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
	const total = allowance;
	const remaining = balance;
	const used = total - remaining;

	console.log("total", total);
	console.log("remaining", remaining);
	console.log("used", used);
	const percentage = total !== 0 ? (used / total) * 100 : 0;
	return { total, remaining, used, percentage };
};
