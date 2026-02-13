/**
 * Track per version:
 *
 * - V1.2:
 * - Included Usage is the free usage and any prepaid quantity
 * - Overage is negative balance
 * - Usage is the total usage
 * - Balance is included_usage
 *
 * - V2.0:
 * - Granted Balance is only the free usage
 * - Purchased Balance is the prepaid quantity + the negative portion of balance
 * - Current Balance is the granted balance + the purchased balance - the usage EXCLUDING the overage
 * - Usage is the total usage EXCLUDING the overage
 *
 * - V2.1:
 * - Granted is only the free usage and any prepaid quantity
 * - Usage is the total usage
 * - Remaining is the current balance
 */

import { expect, test } from "bun:test";
import type {
	ApiBalance,
	ApiBalanceBreakdown,
	ApiCusFeatureV3,
	ApiCusFeatureV3Breakdown,
	ApiCustomer,
} from "@autumn/shared";
import type { ApiCustomerV5 } from "@shared/api/customers/apiCustomerV5";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "@shared/api/customers/cusFeatures/apiBalanceV1";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const testCase = "track-across-all-versions";

const prepaidCreditsItem = items.prepaid({
	featureId: TestFeature.Credits,
	price: 1,
	billingUnits: 1000,
	includedUsage: 5000,
});
const consumableCreditsItem = items.consumable({
	featureId: TestFeature.Credits,
	includedUsage: 0,
	price: 1,
	billingUnits: 1000,
});

const pro = products.pro({
	id: "pro",
	items: [prepaidCreditsItem, consumableCreditsItem],
});

test.concurrent(`${chalk.yellowBright("track-across-all-versions: track across all versions")}`, async () => {
	const { customerId, autumnV1, autumnV2, autumnV2_1 } = await initScenario({
		customerId: testCase,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Credits, quantity: 5000 }],
			}),
		],
	});

	const refreshCustomerBalances = async () => {
		const v1_2customer = await autumnV1.customers.get(customerId);
		const v2customer = await autumnV2.customers.get(customerId);
		const v2_1customer = await autumnV2_1.customers.get(customerId);

		const v1_2balance = v1_2customer.features[TestFeature.Credits];
		const v2balance = (v2customer as unknown as ApiCustomer).balances[
			TestFeature.Credits
		];
		const v2_1balance = (v2_1customer as unknown as ApiCustomerV5).balances[
			TestFeature.Credits
		];

		const v1_2breakdown = v1_2balance.breakdown ?? [];
		const v2breakdown = v2balance.breakdown ?? [];
		const v2_1breakdown = v2_1balance.breakdown ?? [];

		return {
			v1_2balance,
			v2balance,
			v2_1balance,
			v1_2breakdown,
			v2breakdown,
			v2_1breakdown,
		};
	};

	let { v1_2balance, v2balance, v2_1balance } = await refreshCustomerBalances();

	// Initial state: 5000 included + 5000 prepaid = 10000 total
	expect(v1_2balance).toMatchObject({
		included_usage: 10_000,
		usage: 0,
		balance: 10_000,
		overage_allowed: true,
	} satisfies Partial<ApiCusFeatureV3>);

	expect(v2balance).toMatchObject({
		granted_balance: 5000,
		current_balance: 10_000,
		usage: 0,
		purchased_balance: 5000,
		overage_allowed: true,
	} satisfies Partial<ApiBalance>);

	expect(v2_1balance).toMatchObject({
		granted: 10_000,
		usage: 0,
		remaining: 10_000,
		overage_allowed: true,
	} satisfies Partial<ApiBalanceV1>);

	// Track 1000 usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: 1000,
	});

	({ v1_2balance, v2balance, v2_1balance } = await refreshCustomerBalances());

	expect(v1_2balance).toMatchObject({
		included_usage: 10_000,
		usage: 1000,
		balance: 9_000,
		overage_allowed: true,
	} satisfies Partial<ApiCusFeatureV3>);

	expect(v2balance).toMatchObject({
		granted_balance: 5000,
		current_balance: 9_000,
		usage: 1000,
		purchased_balance: 5000,
		overage_allowed: true,
	} satisfies Partial<ApiBalance>);

	expect(v2_1balance).toMatchObject({
		granted: 10_000,
		usage: 1000,
		remaining: 9_000,
		overage_allowed: true,
	} satisfies Partial<ApiBalanceV1>);

	// Track 5000 more usage (6000 total)
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: 5_000,
	});

	({ v1_2balance, v2balance, v2_1balance } = await refreshCustomerBalances());

	expect(v1_2balance).toMatchObject({
		included_usage: 10_000,
		usage: 6_000,
		balance: 4_000,
		overage_allowed: true,
	} satisfies Partial<ApiCusFeatureV3>);

	expect(v2balance).toMatchObject({
		granted_balance: 5000,
		current_balance: 4_000,
		usage: 6_000,
		purchased_balance: 5000,
		overage_allowed: true,
	} satisfies Partial<ApiBalance>);

	expect(v2_1balance).toMatchObject({
		granted: 10_000,
		usage: 6_000,
		remaining: 4_000,
		overage_allowed: true,
	} satisfies Partial<ApiBalanceV1>);

	// Track 5000 more (11000 total - goes into overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: 5_000,
	});

	const { v1_2breakdown, v2breakdown, v2_1breakdown } =
		await refreshCustomerBalances();
	({ v1_2balance, v2balance, v2_1balance } = await refreshCustomerBalances());

	expect(v1_2balance).toMatchObject({
		included_usage: 10_000,
		usage: 11_000,
		balance: -1_000,
		overage_allowed: true,
	} satisfies Partial<ApiCusFeatureV3>);

	expect(v2balance).toMatchObject({
		granted_balance: 5000,
		current_balance: 0,
		usage: 11_000,
		purchased_balance: 6000,
		overage_allowed: true,
	} satisfies Partial<ApiBalance>);

	expect(v2_1balance).toMatchObject({
		granted: 10_000,
		usage: 11_000,
		remaining: 0,
		overage_allowed: true,
	} satisfies Partial<ApiBalanceV1>);

	// Verify breakdowns
	expect(v1_2breakdown ?? []).toHaveLength(2);
	expect(v2breakdown ?? []).toHaveLength(2);
	expect(v2_1breakdown ?? []).toHaveLength(2);

	expect(v1_2breakdown).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				included_usage: 10_000,
				usage: 10_000,
				balance: 0,
				overage_allowed: false,
			} satisfies Partial<ApiCusFeatureV3Breakdown>),
			expect.objectContaining({
				included_usage: 0,
				usage: 1000,
				balance: -1000,
				overage_allowed: true,
			} satisfies Partial<ApiCusFeatureV3Breakdown>),
		]) satisfies Partial<ApiCusFeatureV3Breakdown[]>,
	);

	expect(v2breakdown).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				granted_balance: 5_000,
				current_balance: 0,
				usage: 10_000,
				purchased_balance: 5_000,
				overage_allowed: false,
			} satisfies Partial<ApiBalanceBreakdown>),
			expect.objectContaining({
				granted_balance: 0,
				current_balance: 0,
				usage: 1000,
				purchased_balance: 1_000,
				overage_allowed: true,
			} satisfies Partial<ApiBalanceBreakdown>),
		]) satisfies Partial<ApiBalanceBreakdown[]>,
	);

	expect(v2_1breakdown).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				included_grant: 5_000,
				prepaid_grant: 5_000,
				usage: 10_000,
				remaining: 0,
			} satisfies Partial<ApiBalanceBreakdownV1>),
			expect.objectContaining({
				included_grant: 0,
				prepaid_grant: 0,
				usage: 1000,
				remaining: 0,
			} satisfies Partial<ApiBalanceBreakdownV1>),
		]) satisfies Partial<ApiBalanceBreakdownV1[]>,
	);
});
