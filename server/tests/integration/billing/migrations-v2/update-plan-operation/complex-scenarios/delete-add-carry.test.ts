/**
 * Contract: delete/add patch migrations carry same-feature usage, one-off prepaid balance, and reset anchors.
 * These scenarios intentionally avoid update_items; item changes are remove_items + add_items.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import {
	BillingMethod,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { getBalanceBucket } from "@tests/integration/utils/getBalanceBucket";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const TEN_MINUTES_MS = 10 * 60 * 1000;

const expectCloseToMs = ({
	actual,
	expected,
}: {
	actual?: number | null;
	expected: number;
}) => {
	expect(actual).not.toBeNull();
	expect(Math.abs((actual ?? 0) - expected)).toBeLessThanOrEqual(
		TEN_MINUTES_MS,
	);
};

test.concurrent(`${chalk.yellowBright("migrations complex delete/add: lifetime item to monthly carries usage onto subscription reset")}`, async () => {
	const customerId = "migration-complex-lifetime-to-monthly";
	const pro = products.pro({
		id: "migration-complex-lifetime-to-monthly-plan",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
			s.track({ featureId: TestFeature.Messages, value: 40, timeout: 2000 }),
		],
	});
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const currentPeriodEnd = before.subscriptions.find(
		(subscription) => subscription.plan_id === pro.id,
	)?.current_period_end;
	expect(currentPeriodEnd).not.toBeNull();
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [itemsV2.monthlyMessages({ included: 150 })],
					},
				},
			],
		},
		runOnServer: false,
		noBillingChanges: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 110,
		usage: 40,
		nextResetAt: currentPeriodEnd!,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 150,
				remaining: 110,
				usage: 40,
			},
		},
	});
	const monthlyBucket = getBalanceBucket({
		subject: customer,
		featureId: TestFeature.Messages,
		resetInterval: ResetInterval.Month,
	});
	expectCloseToMs({
		actual: monthlyBucket.reset?.resets_at,
		expected: currentPeriodEnd!,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations complex delete/add: monthly plus one-off prepaid to monthly carries usage and lifetime balance")}`, async () => {
	const customerId = "migration-complex-monthly-oneoff-to-monthly";
	const pro = products.pro({
		id: "migration-complex-monthly-oneoff-to-monthly-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const currentPeriodEnd = before.subscriptions.find(
		(subscription) => subscription.plan_id === pro.id,
	)?.current_period_end;
	expect(currentPeriodEnd).not.toBeNull();
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [itemsV2.monthlyMessages({ included: 300 })],
					},
				},
			],
		},
		runOnServer: false,
		noBillingChanges: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 350,
		usage: 100,
		nextResetAt: currentPeriodEnd!,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 300,
				remaining: 200,
				usage: 100,
			},
			[ResetInterval.OneOff]: {
				included_grant: 150,
				prepaid_grant: 0,
				remaining: 150,
				usage: 0,
			},
		},
	});
	const monthlyBucket = getBalanceBucket({
		subject: customer,
		featureId: TestFeature.Messages,
		resetInterval: ResetInterval.Month,
	});
	expectCloseToMs({
		actual: monthlyBucket.reset?.resets_at,
		expected: currentPeriodEnd!,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations complex delete/add: monthly included increase plus one-off price change preserves both buckets")}`, async () => {
	const customerId = "migration-complex-monthly-oneoff-price-change";
	const pro = products.pro({
		id: "migration-complex-monthly-oneoff-price-change-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const currentPeriodEnd = before.subscriptions.find(
		(subscription) => subscription.plan_id === pro.id,
	)?.current_period_end;
	expect(currentPeriodEnd).not.toBeNull();
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [
							itemsV2.monthlyMessages({ included: 300 }),
							itemsV2.oneOffPrepaidMessages({
								amount: 15,
								billingUnits: 100,
							}),
						],
					},
				},
			],
		},
		runOnServer: false,
		noBillingChanges: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 350,
		usage: 100,
		nextResetAt: currentPeriodEnd!,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 300,
				remaining: 200,
				usage: 100,
			},
			[BillingMethod.Prepaid]: {
				included_grant: 150,
				prepaid_grant: 0,
				remaining: 150,
				usage: 0,
			},
		},
	});
	const monthlyBucket = getBalanceBucket({
		subject: customer,
		featureId: TestFeature.Messages,
		resetInterval: ResetInterval.Month,
	});
	const prepaidBucket = getBalanceBucket({
		subject: customer,
		featureId: TestFeature.Messages,
		billingMethod: BillingMethod.Prepaid,
	});
	expectCloseToMs({
		actual: monthlyBucket.reset?.resets_at,
		expected: currentPeriodEnd!,
	});
	expect(prepaidBucket.reset?.interval).toBe(ResetInterval.OneOff);
	expect(prepaidBucket.price?.amount).toBe(15);
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});
