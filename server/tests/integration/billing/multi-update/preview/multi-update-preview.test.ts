import { expect, test } from "bun:test";
import type { MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

const DAY_MS = 24 * 60 * 60 * 1000;

test.concurrent(
	`${chalk.yellowBright("multi update preview: per-sub next_cycle anchors and totals")}`,
	async () => {
		const customerId = "multi-update-preview-anchors";
		const testStartMs = Date.now();

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const premiumB = products.base({
			id: "premium-b",
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
			group: `${customerId}_b`,
		});
		const addonX = products.recurringAddOn({
			id: "addon-x",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addonY = products.base({
			id: "addon-y",
			items: [
				items.monthlyPrice({ price: 50 }),
				items.monthlyUsers({ includedUsage: 5 }),
			],
			isAddOn: true,
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, premiumB, addonX, addonY] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: premiumB.id }),
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 5,
			waitForSeconds: 30,
		});
		await autumnV2_3.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: addonX.id }, { plan_id: addonY.id }],
			new_billing_subscription: true,
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: premiumB.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addonY.id, cancel_action: "cancel_end_of_cycle" },
			],
		};

		const sub1NextCycleStartsAt = addMonths(testStartMs, 1).getTime();
		const sub2NextCycleStartsAt = addMonths(
			addDays(testStartMs, 5),
			1,
		).getTime();

		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: 0,
			subscriptions: [
				{
					planIds: [premiumB.id],
					total: 0,
					nextCycleTotal: 20,
					nextCycleStartsAt: sub1NextCycleStartsAt,
				},
				{
					planIds: [addonY.id],
					total: 0,
					nextCycleTotal: 20,
					nextCycleStartsAt: sub2NextCycleStartsAt,
				},
			],
		});

		const [first, second] = [...preview.subscriptions].sort(
			(a, b) => (a.next_cycle?.starts_at ?? 0) - (b.next_cycle?.starts_at ?? 0),
		);
		const anchorGapMs =
			(second.next_cycle?.starts_at ?? 0) - (first.next_cycle?.starts_at ?? 0);
		expect(anchorGapMs).toBeWithin(
			5 * DAY_MS - 10 * 60 * 1000,
			5 * DAY_MS + 10 * 60 * 1000,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update preview: per-sub totals for cross-sub immediate cancels")}`,
	async () => {
		const customerId = "multi-update-preview-totals";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: {
				customer_id: customerId,
				updates: [
					{ plan_id: pro.id, cancel_action: "cancel_immediately" },
					{ plan_id: addon.id, cancel_action: "cancel_immediately" },
				],
			},
			total: -40,
			subscriptions: [
				{ planIds: [pro.id], total: -20, nextCycleTotal: null },
				{ planIds: [addon.id], total: -20, nextCycleTotal: null },
			],
		});
	},
);
