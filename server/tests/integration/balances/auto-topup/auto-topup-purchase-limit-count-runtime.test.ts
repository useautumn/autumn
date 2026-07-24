/**
 * Integration coverage: writable purchase_limit.count mid-flow with real ATU.
 *
 * Flow under test:
 *   1. ATU fires once under purchase_limit.limit = 2
 *   2. customers.update sets purchase_limit.count = 1
 *   3. Next drain triggers one more ATU (allowed)
 *   4. Third drain is blocked by the purchase limit
 *
 * Green-success criteria:
 *   - After step 2, expanded purchase_limit.count is 1
 *   - After step 3, balance reflects a second top-up and invoice count grows
 *   - After step 4, balance only drops (no top-up) and invoice count is unchanged
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CustomerExpand,
	PurchaseLimitInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig";

const AUTO_TOPUP_WAIT_MS = 20000;

const getExpandedPurchaseLimit = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];
	customerId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.AutoTopupsPurchaseLimit],
		skip_cache: "true",
	});
	return customer.billing_controls?.auto_topups?.[0]?.purchase_limit as
		| {
				interval: PurchaseLimitInterval | null;
				interval_count: number | null;
				limit: number | null;
				count: number;
				next_reset_at: number;
		  }
		| undefined;
};

test.concurrent(
	`${chalk.yellowBright("auto-topup purchase_limit.count: set mid-flow then block at limit")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-pl-count-runtime",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-pl-count-runtime",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOffProd] }),
			],
			actions: [
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 50,
				quantity: 100,
				purchaseLimit: {
					interval: PurchaseLimitInterval.Month,
					limit: 2,
				},
			}),
		});

		// Round 1: 300 - 260 = 40 → ATU → 140 (purchase 1 / limit 2)
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 260,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const afterFirst = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const expectedAfterFirst = new Decimal(300).sub(260).add(100).toNumber();
		expectBalanceCorrect({
			customer: afterFirst,
			featureId: TestFeature.Messages,
			remaining: expectedAfterFirst,
		});

		const limitAfterFirst = await getExpandedPurchaseLimit({
			autumn: autumnV2_1,
			customerId,
		});
		expect(limitAfterFirst).toMatchObject({
			interval: PurchaseLimitInterval.Month,
			limit: 2,
			count: 1,
		});

		// Mid-flow: write purchase_limit.count = 1 (runtime state, not JSONB)
		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 50,
						quantity: 100,
						purchase_limit: {
							interval: PurchaseLimitInterval.Month,
							interval_count: 1,
							limit: 2,
							count: 1,
						},
					},
				],
			},
		});

		const limitAfterSet = await getExpandedPurchaseLimit({
			autumn: autumnV2_1,
			customerId,
		});
		expect(limitAfterSet).toMatchObject({
			limit: 2,
			count: 1,
		});
		expect(limitAfterSet?.next_reset_at).toBe(limitAfterFirst?.next_reset_at);

		// Round 2: 140 - 100 = 40 → ATU → 140 (purchase 2 / limit 2)
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const afterSecond = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
		);
		const expectedAfterSecond = new Decimal(140).sub(100).add(100).toNumber();
		expectBalanceCorrect({
			customer: afterSecond,
			featureId: TestFeature.Messages,
			remaining: expectedAfterSecond,
		});

		const limitAfterSecond = await getExpandedPurchaseLimit({
			autumn: autumnV2_1,
			customerId,
		});
		expect(limitAfterSecond).toMatchObject({
			limit: 2,
			count: 2,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		// Round 3: 140 - 100 = 40 → blocked (already at limit)
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await timeout(AUTO_TOPUP_WAIT_MS);

		const afterBlocked = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
		);
		expectBalanceCorrect({
			customer: afterBlocked,
			featureId: TestFeature.Messages,
			remaining: 40,
		});

		const limitAfterBlocked = await getExpandedPurchaseLimit({
			autumn: autumnV2_1,
			customerId,
		});
		expect(limitAfterBlocked).toMatchObject({
			limit: 2,
			count: 2,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});
	},
);
