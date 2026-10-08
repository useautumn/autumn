import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import {
	LICENSE_POOLED_HIGH_GRANT,
	LICENSE_POOLED_LOW_GRANT,
	pooledMonthlyMessages,
	pooledSeatPlan,
} from "./licensePooledBalanceTestUtils.js";

export const SEAT_COUNT = 3;

export const amountChangePlans = ({ prefix }: { prefix: string }) => {
	const seatGroup = `${prefix}-seats`;
	return {
		pro: products.pro({
			id: `${prefix}-pro`,
			items: [items.dashboard()],
		}),
		premium: products.premium({
			id: `${prefix}-premium`,
			items: [items.dashboard()],
		}),
		seatLow: pooledSeatPlan({
			id: `${prefix}-seat-200`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_LOW_GRANT,
			}),
			group: seatGroup,
		}),
		seatHigh: pooledSeatPlan({
			id: `${prefix}-seat-400`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_HIGH_GRANT,
			}),
			group: seatGroup,
		}),
	};
};
