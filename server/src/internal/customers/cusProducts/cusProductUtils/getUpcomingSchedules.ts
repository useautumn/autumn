import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { cusProductToPrices } from "@autumn/shared";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";

export type ScheduledStartStatusPair = {
	starts_at: number;
	status: CusProductStatus;
};

/**
 * Return unique pairs of (starts_at, status) for customer products that are Scheduled and start in the future.
 * Results are sorted by starts_at ascending.
 */
export const getUniqueUpcomingSchedulePairs = ({
	cusProducts,
	now,
	includePast = false,
}: {
	cusProducts: FullCusProduct[];
	now?: number;
	/** If true, include scheduled items with starts_at <= now */
	includePast?: boolean;
}): number[] => {
	const currentTime = now ?? Date.now();
	const uniqueKeys = new Set<string>();
	const pairs: ScheduledStartStatusPair[] = [];

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const free = isFreeProduct(prices);
		const oneOff = isOneOff(prices);

		if (cusProduct.status !== CusProductStatus.Scheduled) continue;
		if (typeof cusProduct.starts_at !== "number") continue;
		if (!includePast && cusProduct.starts_at <= currentTime) continue;
		// if (free || oneOff) continue;

		const key = `${cusProduct.starts_at}|${cusProduct.status}`;
		if (uniqueKeys.has(key)) continue;
		uniqueKeys.add(key);
		pairs.push({ starts_at: cusProduct.starts_at, status: cusProduct.status });
	}

	pairs.sort((a, b) => a.starts_at - b.starts_at);
	return pairs.map((p) => p.starts_at);
};

// export const logSchedulePairs = ({
//   pairs,
// }: {
//   pairs: ScheduledStartStatusPair[];
// }) => {
//   for (const pair of pairs) {
//     console.log(`${formatUnixToDateTime(pair.starts_at)} - ${pair.status}`);
//   }
// };
