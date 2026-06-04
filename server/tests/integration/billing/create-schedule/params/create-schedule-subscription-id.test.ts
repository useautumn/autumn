/**
 * TDD test for create_schedule per-plan subscription_id support.
 *
 * Contract under test:
 *   New types/fields:
 *     - CreateScheduleParamsV0.phases[].plans[].subscription_id?: string
 *   New endpoints:
 *     - POST /billing.create_schedule accepts subscription_id for immediate and future phase plans
 *   New behaviors:
 *     - The provided value becomes the Autumn subscription API id in customer.subscriptions[].id
 *   Side effects:
 *     - Persist subscription_id in customer_products.external_id
 *     - Do not persist the provided subscription_id in customer_products.subscription_ids
 *
 * Pre-impl red: create_schedule schema rejects subscription_id and future phases cannot carry it into customer_products.external_id.
 * Post-impl green: immediate and scheduled customer products expose the requested API ids.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("create-schedule subscription_id: persists immediate and future plan ids")}`,
	async () => {
		const customerId = "create-schedule-sub-id";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id, subscription_id: "main-sub" }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id, subscription_id: "premium-sub" }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.phases).toHaveLength(2);

		const customerProductIds = response.phases.flatMap(
			(phase) => phase.customer_product_ids,
		);
		const rows = await ctx.db
			.select({
				id: customerProducts.id,
				productId: customerProducts.product_id,
				status: customerProducts.status,
				externalId: customerProducts.external_id,
				subscriptionIds: customerProducts.subscription_ids,
			})
			.from(customerProducts)
			.where(inArray(customerProducts.id, customerProductIds));

		const mainRow = rows.find((row) => row.productId === pro.id);
		const premiumRow = rows.find((row) => row.productId === premium.id);

		expect(mainRow).toMatchObject({
			status: CusProductStatus.Active,
			externalId: "main-sub",
		});
		expect(premiumRow).toMatchObject({
			status: CusProductStatus.Scheduled,
			externalId: "premium-sub",
		});
		expect(mainRow?.subscriptionIds ?? []).not.toContain("main-sub");
		expect(premiumRow?.subscriptionIds ?? []).not.toContain("premium-sub");

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const mainSubscription = customer.subscriptions.find(
			(subscription) => subscription.id === "main-sub",
		);
		const premiumSubscription = customer.subscriptions.find(
			(subscription) => subscription.id === "premium-sub",
		);

		expect(mainSubscription).toMatchObject({
			plan_id: pro.id,
			status: "active",
		});
		expect(premiumSubscription).toMatchObject({
			plan_id: premium.id,
			status: "scheduled",
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule subscription_id: duplicate ids are not validated yet")}`,
	async () => {
		const customerId = "create-schedule-sub-id-dup";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id, subscription_id: "same-sub" }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id, subscription_id: "same-sub" }],
				},
			],
		});

		expect(response.status).toBe("created");
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule subscription_id: update can reuse existing plan ids")}`,
	async () => {
		const customerId = "create-schedule-sub-id-update";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id, subscription_id: "main-sub" }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id, subscription_id: "premium-sub" }],
				},
			],
		});

		const updateResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id, subscription_id: "main-sub" }],
				},
				{
					starts_at: now + ms.days(45),
					plans: [{ plan_id: premium.id, subscription_id: "premium-sub" }],
				},
			],
		});

		expect(updateResponse.status).toBe("created");
		expect(updateResponse.phases).toHaveLength(2);

		const customerProductIds = updateResponse.phases.flatMap(
			(phase) => phase.customer_product_ids,
		);
		const rows = await ctx.db
			.select({
				id: customerProducts.id,
				productId: customerProducts.product_id,
				status: customerProducts.status,
				externalId: customerProducts.external_id,
			})
			.from(customerProducts)
			.where(inArray(customerProducts.id, customerProductIds));

		expect(rows.find((row) => row.productId === pro.id)).toMatchObject({
			status: CusProductStatus.Active,
			externalId: "main-sub",
		});
		expect(rows.find((row) => row.productId === premium.id)).toMatchObject({
			status: CusProductStatus.Scheduled,
			externalId: "premium-sub",
		});
	},
);
