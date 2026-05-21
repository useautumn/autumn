/**
 * billing.update / UpdatePlan: one-off prepaid carryover.
 *
 * The customPlan path MERGES preserved balance into the new cusProduct's
 * matching one-off prepaid slot when one exists (no separate lifetime row);
 * it falls back to a lifetime cusEnt when the new cusProduct has no slot.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// 1. items+options update keeps the one-off prepaid item → preserved balance
//    merges INTO the new one-off cusEnt (no separate lifetime bucket).
test.concurrent(
	`${chalk.yellowBright("one-off-preserve updateSub 1: merge — items+options update merges preserved balance into the new one-off cusEnt")}`,
	async () => {
		const customerId = "one-off-preserve-update-merge";

		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-merge", items: [oneOffItem] });

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.oneOffPrepaidMessages(), itemsV2.dashboard()],
			},
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBeCloseTo(10, 1);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		// Merge target exists → preserved 150 stacks on the new pack of 100 →
		// 250 on a SINGLE bucket (the merged one-off prepaid slot). The bucket's
		// `prepaid_grant: 100` proves it's the paid slot, not a lifetime carryover
		// (which has no price → prepaid_grant: 0).
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 250,
			usage: 0,
			breakdown: {
				prepaid: { remaining: 250, prepaid_grant: 100, included_grant: 150 },
			},
		});
		expect(customer.balances[TestFeature.Messages]!.breakdown).toHaveLength(1);

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: 10,
		});
	},
);

// 2. Items-only update that REMOVES the one-off item → no merge slot,
//    so the carryover falls back to a lifetime cusEnt.
test.concurrent(
	`${chalk.yellowBright("one-off-preserve updateSub 2: lifetime fallback — removed one-off item leaves preserved balance as a lifetime cusEnt")}`,
	async () => {
		const customerId = "one-off-preserve-update-lifetime";

		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-lifetime", items: [oneOffItem] });

		const { autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.dashboard()],
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		// No matching slot → preserved as a lifetime carryover cusEnt with no
		// price. `prepaid_grant: 0` is the giveaway that it's a carryover, not
		// a paid slot. `included_grant: 150` because the carryover entitlement's
		// allowance is set to the preserved balance.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 150,
			usage: 0,
			breakdown: {
				one_off: { remaining: 150, prepaid_grant: 0, included_grant: 150 },
			},
		});
		expect(customer.balances[TestFeature.Messages]!.breakdown).toHaveLength(1);
	},
);

// 3. Mixed monthly + one-off on the same feature. Monthly's usage carries to
//    the new monthly bucket; the one-off side merges into the new one-off slot.
test.concurrent(
	`${chalk.yellowBright("one-off-preserve updateSub 3: mixed — monthly usage carries, one-off remainder merges into the new prepaid bucket")}`,
	async () => {
		const customerId = "one-off-preserve-update-mixed";

		const monthlyItem = items.monthlyMessages({ includedUsage: 100 });
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro-mixed-update",
			items: [monthlyItem, oneOffItem],
		});

		const { autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// monthly drains first → monthly=0 (100 used), one-off=150 (50 used).
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					itemsV2.monthlyMessages({ included: 1000 }),
					itemsV2.oneOffPrepaidMessages(),
					itemsV2.dashboard(),
				],
			},
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		// Two buckets: monthly (1000 − 100 carried usage) + the merged one-off
		// prepaid slot (100 new + 150 preserved). The `prepaid` bucket's
		// `prepaid_grant: 100` confirms the merge — a lifetime carryover would
		// be a third bucket with `prepaid_grant: 0`.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 1150,
			usage: 100,
			breakdown: {
				month: { remaining: 900 },
				prepaid: { remaining: 250, prepaid_grant: 100, included_grant: 150 },
			},
		});
		expect(customer.balances[TestFeature.Messages]!.breakdown).toHaveLength(2);
	},
);
