import {
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import {
	isFreeProduct,
	isOneOff,
} from "@server/internal/products/productUtils";

/**
 * Return unique transition points for customer products:
 * 1. Scheduled products (will start in the future)
 * 2. Active products scheduled for cancellation (will end at ended_at)
 * Results are sorted ascending, truncated to second precision.
 */
export const getUniqueUpcomingSchedulePairs = ({
	cusProducts,
	now,
	includePast = false,
}: {
	cusProducts: FullCusProduct[];
	now?: number;
	/** If true, include items with starts_at/ended_at <= now */
	includePast?: boolean;
}): number[] => {
	const currentTime = now ?? Date.now();
	// Deduplicate by timestamp only (not timestamp+status)
	// A scheduled product starting at T and a canceled product ending at T
	// represent the same transition point
	const uniqueTimestamps = new Set<number>();

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const free = isFreeProduct(prices);
		const oneOff = isOneOff(prices);

		// Case 1: Scheduled products (will start)
		if (cusProduct.status === CusProductStatus.Scheduled) {
			if (typeof cusProduct.starts_at !== "number") continue;
			if (!includePast && cusProduct.starts_at <= currentTime) continue;

			uniqueTimestamps.add(truncateMsToSecondPrecision(cusProduct.starts_at));
		}

		// Case 2: Active products scheduled for cancellation (will end)
		if (
			cusProduct.status === CusProductStatus.Active &&
			cusProduct.canceled &&
			cusProduct.ended_at
		) {
			if (!includePast && cusProduct.ended_at <= currentTime) continue;
			if (free || oneOff) continue;

			uniqueTimestamps.add(truncateMsToSecondPrecision(cusProduct.ended_at));
		}
	}

	return Array.from(uniqueTimestamps).sort((a, b) => a - b);
};

// ==================== PREVIOUS IMPLEMENTATION ====================
// export type ScheduledStartStatusPair = {
// 	starts_at: number;
// 	status: CusProductStatus;
// };
//
// export const getUniqueUpcomingSchedulePairs_OLD = ({
// 	cusProducts,
// 	now,
// 	includePast = false,
// }: {
// 	cusProducts: FullCusProduct[];
// 	now?: number;
// 	includePast?: boolean;
// }): number[] => {
// 	const currentTime = now ?? Date.now();
// 	const uniqueKeys = new Set<string>();
// 	const pairs: ScheduledStartStatusPair[] = [];
//
// 	for (const cusProduct of cusProducts) {
// 		const prices = cusProductToPrices({ cusProduct });
// 		const free = isFreeProduct(prices);
// 		const oneOff = isOneOff(prices);
//
// 		// Case 1: Scheduled products (will start)
// 		if (cusProduct.status === CusProductStatus.Scheduled) {
// 			if (typeof cusProduct.starts_at !== "number") continue;
// 			if (!includePast && cusProduct.starts_at <= currentTime) continue;
//
// 			const key = `${cusProduct.starts_at}|scheduled`;
// 			if (!uniqueKeys.has(key)) {
// 				uniqueKeys.add(key);
// 				pairs.push({
// 					starts_at: cusProduct.starts_at,
// 					status: cusProduct.status,
// 				});
// 			}
// 		}
//
// 		// Case 2: Active products scheduled for cancellation (will end)
// 		if (
// 			cusProduct.status === CusProductStatus.Active &&
// 			cusProduct.canceled &&
// 			cusProduct.ended_at
// 		) {
// 			if (!includePast && cusProduct.ended_at <= currentTime) continue;
// 			if (free || oneOff) continue;
//
// 			const key = `${cusProduct.ended_at}|canceled`;
// 			if (!uniqueKeys.has(key)) {
// 				uniqueKeys.add(key);
// 				pairs.push({
// 					starts_at: cusProduct.ended_at,
// 					status: cusProduct.status,
// 				});
// 			}
// 		}
// 	}
//
// 	pairs.sort((a, b) => a.starts_at - b.starts_at);
// 	return pairs.map((p) => p.starts_at);
// };
// ==================== END PREVIOUS IMPLEMENTATION ====================
