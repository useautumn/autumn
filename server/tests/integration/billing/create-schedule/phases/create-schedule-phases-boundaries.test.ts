import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getCustomerProductRows } from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule: now phase replaces same-slot plans and leaves undeclared ones active")}`,
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

		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
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

		const now = advancedTo;
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

		// The add-on keys on its own id, so no phase claims its slot and the
		// schedule leaves it alone.
		expect(activeRows).toEqual(
			[
				{ productId: currentAddon.id, status: CusProductStatus.Active },
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
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [nextAddon.id, nextBase.id],
			notPresent: [nowAddon.id, nowBase.id],
		});
	},
);
