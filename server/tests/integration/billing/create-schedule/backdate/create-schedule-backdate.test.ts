/**
 * TDD tests for backdated first phases in create_schedule.
 *
 * Contract under test:
 *   New types/fields:
 *     - Internal BillingContext.subscriptionBackdateStartMs?: epoch milliseconds
 *   New endpoints:
 *     - Existing billing.createSchedule accepts a first phase starts_at in the past for supported new-subscription creation
 *   New behaviors:
 *     - Backdated first phase creates one Stripe subscription with start_date backdated to phase starts_at
 *     - Future phases are still materialized as scheduled Autumn customer products and Stripe subscription schedule phases
 *     - Backdated first phases can include add-ons or be scoped to an entity
 *   Side effects:
 *     - Immediate-phase customer_products are active and store the past starts_at
 *     - First invoice is created by Stripe for the backdated subscription
 */

import { test } from "bun:test";
import {
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	ms,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCreateScheduleBackdateCorrect } from "../utils/expectCreateScheduleBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate: first phase creates backdated subscription")}`,
	async () => {
		const customerId = "create-schedule-backdate";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const futureStartsAt = advancedTo + ms.days(30);
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: startsAt,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: futureStartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);

		await expectCreateScheduleBackdateCorrect({
			ctx,
			response,
			immediate: {
				productId: pro.id,
				status: CusProductStatus.Active,
				startsAt,
			},
			scheduled: [
				{
					productId: premium.id,
					status: CusProductStatus.Scheduled,
					startsAt: futureStartsAt,
				},
			],
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate add-ons: first phase bills main and add-on")}`,
	async () => {
		const customerId = "create-schedule-backdate-addons";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon, premium] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const futureStartsAt = advancedTo + ms.days(30);
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: startsAt,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
				{
					starts_at: futureStartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);

		await expectCreateScheduleBackdateCorrect({
			ctx,
			response,
			immediate: [
				{
					productId: pro.id,
					status: CusProductStatus.Active,
					startsAt,
				},
				{
					productId: addon.id,
					status: CusProductStatus.Active,
					startsAt,
				},
			],
			scheduled: [
				{
					productId: premium.id,
					status: CusProductStatus.Scheduled,
					startsAt: futureStartsAt,
				},
			],
			minInvoiceTotal: 4000,
			minInvoiceLineCount: 4,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate entity: first phase creates entity-scoped backdated subscription")}`,
	async () => {
		const customerId = "create-schedule-backdate-entity";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV1, ctx, advancedTo, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const startsAt = advancedTo - ms.days(35);
		const futureStartsAt = advancedTo + ms.days(30);
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			entity_id: entityId,
			phases: [
				{
					starts_at: startsAt,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: futureStartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);

		await expectCreateScheduleBackdateCorrect({
			ctx,
			response,
			immediate: {
				productId: pro.id,
				status: CusProductStatus.Active,
				startsAt,
				entityId,
			},
			scheduled: [
				{
					productId: premium.id,
					status: CusProductStatus.Scheduled,
					startsAt: futureStartsAt,
					entityId,
				},
			],
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
		});
	},
);
