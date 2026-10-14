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

export const getUniqueUpcomingSchedulePairs = ({
	cusProducts,
	now,
	includePast = false,
}: {
	cusProducts: FullCusProduct[];
	now?: number;
	includePast?: boolean;
}): number[] => {
	const currentTime = now ?? Date.now();
	const uniqueTimestamps = new Set<number>();

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const free = isFreeProduct(prices);
		const oneOff = isOneOff(prices);

		if (cusProduct.status === CusProductStatus.Scheduled) {
			if (typeof cusProduct.starts_at !== "number") continue;
			if (!includePast && cusProduct.starts_at <= currentTime) continue;

			uniqueTimestamps.add(truncateMsToSecondPrecision(cusProduct.starts_at));
		}

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
