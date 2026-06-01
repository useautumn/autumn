import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import {
	getCustomerProductRows,
	getRequiredScheduleId,
} from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule: bills the first phase immediately and stores later phases as scheduled")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-basic",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		const now = Date.now();
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);
		const scheduleId = getRequiredScheduleId(response.schedule_id);

		expect(response.customer_id).toBe(customerId);
		expect(response.entity_id).toBeNull();
		expect(response.status).toBe("created");
		expect(response.payment_url).toBeNull();
		expect(response.invoice?.total).toBe(40);
		expect(response.phases).toHaveLength(2);
		expect(response.phases[0]!.starts_at).toBe(now);
		expect(response.phases[0]!.customer_product_ids).toHaveLength(2);
		expect(response.phases[1]!.starts_at).toBe(now + ms.days(30));
		expect(response.phases[1]!.customer_product_ids).toHaveLength(1);

		const dbSchedule = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.id, scheduleId));
		expect(dbSchedule).toHaveLength(1);

		const dbPhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, scheduleId));
		expect(dbPhases).toHaveLength(2);

		const immediatePhaseCustomerProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, response.phases[0]!.customer_product_ids),
			);
		const phase1CustomerProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(customerProducts.id, response.phases[1]!.customer_product_ids),
			);

		expect(immediatePhaseCustomerProducts).toHaveLength(2);
		expect(
			immediatePhaseCustomerProducts.every(
				(customerProduct) => customerProduct.status === CusProductStatus.Active,
			),
		).toBe(true);
		expect(phase1CustomerProducts).toHaveLength(1);
		expect(
			phase1CustomerProducts.every(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Scheduled,
			),
		).toBe(true);
		expect(
			immediatePhaseCustomerProducts.filter(
				(customerProduct) => customerProduct.product_id === pro.id,
			),
		).toHaveLength(1);
		expect(
			immediatePhaseCustomerProducts.filter(
				(customerProduct) => customerProduct.product_id === addon.id,
			),
		).toHaveLength(1);
		expect(phase1CustomerProducts[0]!.product_id).toBe(pro.id);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: later-phase-only plans stay scheduled and never hit immediate billing")}`,
	async () => {
		const nowBase = products.pro({
			id: "create-schedule-now-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const nowAddon = products.recurringAddOn({
			id: "create-schedule-now-addon",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const futureGroupB = products.base({
			id: "create-schedule-future-group-b",
			items: [items.monthlyUsers({ includedUsage: 5 }), items.monthlyPrice()],
			group: "group-b",
		});
		const futureGroupC = products.base({
			id: "create-schedule-future-group-c",
			items: [
				items.monthlyMessages({ includedUsage: 250 }),
				items.monthlyPrice(),
			],
			group: "group-c",
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-future-only-not-now",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [nowBase, nowAddon, futureGroupB, futureGroupC],
				}),
			],
			actions: [],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: futureGroupB.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: futureGroupC.id }],
				},
			],
		});

		const productRows = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [nowBase.id, nowAddon.id, futureGroupB.id, futureGroupC.id],
		});
		const activeRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Active)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));
		const scheduledRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));

		expect(activeRows).toEqual(
			[
				{ productId: nowBase.id, status: CusProductStatus.Active },
				{ productId: nowAddon.id, status: CusProductStatus.Active },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(scheduledRows).toEqual(
			[
				{ productId: futureGroupB.id, status: CusProductStatus.Scheduled },
				{ productId: futureGroupC.id, status: CusProductStatus.Scheduled },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestInvoiceProductIds: [nowBase.id, nowAddon.id],
		});
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupB.id);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureGroupC.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: now phase stays the exact active set across groups and future phases")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const usersItem = items.monthlyUsers({ includedUsage: 5 });
		const wordsItem = items.monthlyWords({ includedUsage: 25 });

		const currentA = products.base({
			id: "create-schedule-exact-current-a",
			items: [messagesItem, items.monthlyPrice({ price: 5 })],
		});
		const keepNowB = products.base({
			id: "create-schedule-exact-keep-b",
			items: [usersItem, items.monthlyPrice({ price: 5 })],
			group: "group-b",
		});
		const currentAddon = products.recurringAddOn({
			id: "create-schedule-exact-current-addon",
			items: [wordsItem],
		});
		const nowReplacementA = products.pro({
			id: "create-schedule-exact-now-a",
			items: [messagesItem],
		});
		const futureReplacementB = products.base({
			id: "create-schedule-exact-future-b",
			items: [usersItem, items.monthlyPrice({ price: 15 })],
			group: "group-b",
		});
		const futureAddon = products.recurringAddOn({
			id: "create-schedule-exact-future-addon",
			items: [wordsItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-exact-now-set",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [
						currentA,
						keepNowB,
						currentAddon,
						nowReplacementA,
						futureReplacementB,
						futureAddon,
					],
				}),
			],
			actions: [
				s.billing.attach({ productId: currentA.id }),
				s.billing.attach({ productId: keepNowB.id }),
				s.billing.attach({ productId: currentAddon.id }),
			],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowReplacementA.id }, { plan_id: keepNowB.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [
						{ plan_id: futureReplacementB.id },
						{ plan_id: futureAddon.id },
					],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: currentA.id }],
				},
			],
		});

		const productRows = await getCustomerProductRows({
			ctx,
			customerId,
			productIds: [
				currentA.id,
				keepNowB.id,
				currentAddon.id,
				nowReplacementA.id,
				futureReplacementB.id,
				futureAddon.id,
			],
		});
		const activeRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Active)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));
		const scheduledRows = productRows
			.filter((productRow) => productRow.status === CusProductStatus.Scheduled)
			.sort((a, b) => a.productId!.localeCompare(b.productId!));

		expect(activeRows).toEqual(
			[
				{ productId: keepNowB.id, status: CusProductStatus.Active },
				{ productId: nowReplacementA.id, status: CusProductStatus.Active },
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);
		expect(scheduledRows).toEqual(
			[
				{ productId: currentA.id, status: CusProductStatus.Scheduled },
				{ productId: futureAddon.id, status: CusProductStatus.Scheduled },
				{
					productId: futureReplacementB.id,
					status: CusProductStatus.Scheduled,
				},
			].sort((a, b) => a.productId.localeCompare(b.productId)),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(
			futureReplacementB.id,
		);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureAddon.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: plans omitted from the next phase end at the phase boundary")}`,
	async () => {
		const nowBase = products.pro({
			id: "create-schedule-phase-end-now-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const nowAddon = products.recurringAddOn({
			id: "create-schedule-phase-end-now-addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const nextBase = products.premium({
			id: "create-schedule-phase-end-next-base",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const nextAddon = products.recurringAddOn({
			id: "create-schedule-phase-end-next-addon",
			items: [items.monthlyWords({ includedUsage: 75 })],
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-phase-end-boundary",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [nowBase, nowAddon, nextBase, nextAddon] }),
				],
				actions: [],
			});

		const now = advancedTo;
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: nowBase.id }, { plan_id: nowAddon.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: nextBase.id }, { plan_id: nextAddon.id }],
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: now + ms.days(16),
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [nextAddon.id, nextBase.id],
			notPresent: [nowAddon.id, nowBase.id],
		});
	},
);
