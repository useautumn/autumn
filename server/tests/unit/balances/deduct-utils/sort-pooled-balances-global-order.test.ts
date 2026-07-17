import { describe, expect, test } from "bun:test";
import {
	EntInterval,
	type FullCusEntWithFullCusProduct,
	sortCusEntsForDeduction,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";

const createPooledBalance = ({
	id,
	interval,
	nextResetAt,
}: {
	id: string;
	interval: EntInterval;
	nextResetAt: number;
}): FullCusEntWithFullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer-entitlement-${id}`,
		entitlementId: `entitlement-${id}`,
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance: 500,
		interval,
		nextResetAt,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	return {
		...customerEntitlement,
		customer_product: customerProducts.create({
			id: `customer-product-${id}`,
			customerEntitlements: [customerEntitlement],
		}),
	};
};

describe("pooled balances use Autumn's global deduction order", () => {
	test("configured interval wins even when the monthly balance resets sooner", () => {
		const monthly = createPooledBalance({
			id: "monthly",
			interval: EntInterval.Month,
			nextResetAt: Date.UTC(2026, 6, 31, 23, 59),
		});
		const daily = createPooledBalance({
			id: "daily",
			interval: EntInterval.Day,
			nextResetAt: Date.UTC(2026, 7, 1, 12),
		});

		const balances = [monthly, daily];
		sortCusEntsForDeduction({ cusEnts: balances });

		expect(balances.map(({ id }) => id)).toEqual([
			"customer-entitlement-daily",
			"customer-entitlement-monthly",
		]);
	});

	test("reverse deduction order reverses the same interval-based rule", () => {
		const monthly = createPooledBalance({
			id: "monthly",
			interval: EntInterval.Month,
			nextResetAt: Date.UTC(2026, 6, 31, 23, 59),
		});
		const daily = createPooledBalance({
			id: "daily",
			interval: EntInterval.Day,
			nextResetAt: Date.UTC(2026, 7, 1, 12),
		});

		const balances = [daily, monthly];
		sortCusEntsForDeduction({ cusEnts: balances, reverseOrder: true });

		expect(balances.map(({ id }) => id)).toEqual([
			"customer-entitlement-monthly",
			"customer-entitlement-daily",
		]);
	});
});
