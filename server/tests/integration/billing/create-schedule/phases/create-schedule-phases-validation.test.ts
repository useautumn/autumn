import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("create-schedule: rejects updating a schedule after earlier phases started when past phases are resubmitted")}`,
	async () => {
		const originalPastBase = products.base({
			id: "create-schedule-update-history-past-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const currentBase = products.base({
			id: "create-schedule-update-history-current-base",
			items: [items.monthlyMessages({ includedUsage: 300 })],
			group: "current-base",
		});
		const currentAddon = products.recurringAddOn({
			id: "create-schedule-update-history-current-addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const futureBase = products.base({
			id: "create-schedule-update-history-future-base",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			group: "current-base",
		});

		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-update-history",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({
						list: [originalPastBase, currentBase, currentAddon, futureBase],
					}),
				],
				actions: [],
			});

		const now = advancedTo;
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: originalPastBase.id }],
				},
				{
					starts_at: now + ms.days(15),
					plans: [{ plan_id: currentBase.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: futureBase.id }],
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: now + ms.days(16),
			waitForSeconds: 30,
		});

		await expectAutumnError({
			func: async () =>
				autumnV1.billing.createSchedule({
					customer_id: customerId,
					phases: [
						{
							starts_at: now,
							plans: [{ plan_id: originalPastBase.id }],
						},
						{
							starts_at: now + ms.days(15),
							plans: [
								{ plan_id: currentBase.id },
								{ plan_id: currentAddon.id },
							],
						},
						{
							starts_at: now + ms.days(30),
							plans: [{ plan_id: futureBase.id }],
						},
					],
				}),
			errMessage:
				"Past first phase starts_at is only supported for paid recurring plans.",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: rejects invalid timing and entity input")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-schedule-errors",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage:
				"Past first phase starts_at is only supported for paid recurring plans.",
			func: async () => {
				await autumnV1.billing.createSchedule({
					customer_id: customerId,
					phases: [
						{
							starts_at: Date.now() - ms.days(1),
							plans: [{ plan_id: free.id }],
						},
					],
				});
			},
		});

		await expectAutumnError({
			errMessage: "The first phase must start immediately",
			func: async () => {
				await autumnV1.billing.createSchedule({
					customer_id: customerId,
					phases: [
						{
							starts_at: Date.now() + ms.days(1),
							plans: [{ plan_id: pro.id }],
						},
					],
				});
			},
		});

		await expectAutumnError({
			errMessage: "Phase starts_at values must be strictly increasing",
			func: async () => {
				const duplicateStartsAt = Date.now();
				await autumnV1.billing.createSchedule({
					customer_id: customerId,
					phases: [
						{
							starts_at: duplicateStartsAt,
							plans: [{ plan_id: pro.id }],
						},
						{
							starts_at: duplicateStartsAt,
							plans: [{ plan_id: pro.id }],
						},
					],
				});
			},
		});

		await expectAutumnError({
			errMessage: "not found",
			func: async () => {
				await autumnV1.billing.createSchedule({
					customer_id: customerId,
					entity_id: "missing-entity",
					phases: [
						{
							starts_at: Date.now(),
							plans: [{ plan_id: pro.id }],
						},
					],
				});
			},
		});

		await expectAutumnError({
			errMessage: 'Unrecognized key: "free_trial"',
			func: async () => {
				await autumnV1.billing.createSchedule({
					customer_id: customerId,
					phases: [
						{
							starts_at: Date.now(),
							plans: [
								{
									plan_id: pro.id,
									customize: {
										free_trial: {
											duration_length: 7,
											duration_type: "day",
											card_required: false,
										},
									},
								},
							],
						},
					],
				});
			},
		});
	},
);
