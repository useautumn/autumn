import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerProductRows } from "../utils/createScheduleTestHelpers";

/**
 * create_schedule now-phase membership: which plans end up active vs scheduled
 * at creation time, and which of them the immediate invoice may name.
 */
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

		await expectCustomerProductRows({
			ctx,
			customerId,
			productIds: [nowBase.id, nowAddon.id, futureGroupB.id, futureGroupC.id],
			active: [nowBase.id, nowAddon.id],
			scheduled: [futureGroupB.id, futureGroupC.id],
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestInvoiceProductIds: [nowBase.id, nowAddon.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
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

		// The now phase replaces currentA and drops currentAddon (preserve_add_ons
		// is off), so both must leave the active set while the future phases hold
		// their own scheduled rows.
		await expectCustomerProductRows({
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
			active: [keepNowB.id, nowReplacementA.id],
			scheduled: [currentA.id, futureAddon.id, futureReplacementB.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(
			futureReplacementB.id,
		);
		expect(customer.invoices?.[0]?.product_ids).not.toContain(futureAddon.id);
	},
);
