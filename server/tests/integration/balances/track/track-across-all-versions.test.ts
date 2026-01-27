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
/** biome-ignore-all lint/style/useConst: tanvir ahmed is the BEST developer in the whole wide world */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@shared/api/customers/apiCustomerV5";
import type {
	ApiBalanceBreakdownV1,
	ApiBalanceV1,
} from "@shared/api/customers/cusFeatures/apiBalanceV1";
import type {
	ApiBalance,
	ApiBalanceBreakdown,
	ApiCusFeatureV3,
	ApiCusFeatureV3Breakdown,
	ApiCustomer,
} from "@shared/index";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("track-across-all-versions: track across all versions")}`, async () => {
	const pro = constructProduct({
		type: "pro",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Credits,
				includedUsage: 5000,
				price: 1,
				billingUnits: 1000,
			}),
			constructArrearItem({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				price: 1,
				billingUnits: 1000,
			}),
		],
	});

	const {
		customerId,
		autumnV1: autumnV1_2,
		autumnV2,
		autumnV2_1,
	} = await initScenario({
		customerId: "track-across-all-versions-customer",
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
		let v1_2customer = await autumnV1_2.customers.get(customerId);
		let v2customer = await autumnV2.customers.get(customerId);
		let v2_1customer = await autumnV2_1.customers.get(customerId);

		let v1_2balance = v1_2customer.features[TestFeature.Credits];
		let v2balance = (v2customer as unknown as ApiCustomer).balances[
			TestFeature.Credits
		];
		let v2_1balance = (v2_1customer as unknown as ApiCustomerV5).balances[
			TestFeature.Credits
		];

		let v1_2breakdown = v1_2balance.breakdown ?? [];
		let v2breakdown = v2balance.breakdown ?? [];
		let v2_1breakdown = v2_1balance.breakdown ?? [];

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

	await autumnV1_2.track({
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

	({ v1_2balance, v2balance, v2_1balance } = await refreshCustomerBalances());

	await autumnV1_2.track({
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
