/**
 * A custom first-phase billing_cycle_anchor, sent the way the dashboard's Set Plans sheet sends it:
 * a timestamp on phases[0] with the default proration (no proration_behavior).
 * Live subscription → cycle resets on the anchor; new subscription → stub until the anchor;
 * a later phase still resets at its own start.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	formatMsToDate,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateBillingCycleAnchorResetNextCycle,
	calculateNewSubscriptionAnchorStub,
} from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCycleResetPhase } from "../utils/resyncUtils";

const cycleResetWarning = (anchorMs: number) =>
	expect.objectContaining({
		type: "cycle_reset",
		message: `The billing cycle resets on ${formatMsToDate(anchorMs)}.`,
	});

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor: a live subscription's cycle resets on the picked date, billed as previewed")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-custom-anchor-live",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedReset = await calculateBillingCycleAnchorResetNextCycle({
			customerId,
			billingCycleAnchorMs: anchorMs,
			nextCycleAmount: 20,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(preview.warnings).toContainEqual(cycleResetWarning(anchorMs));
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: expectedReset.startsAt,
			total: expectedReset.total,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: anchorMs,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedReset.total,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor: a new subscription bills a stub until the picked date, then full cycles from it")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-custom-anchor-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedStub = calculateNewSubscriptionAnchorStub({
			advancedTo,
			anchorMs,
			amount: 20,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedStub);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: 20,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: expectedStub,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: anchorMs,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor: a later phase still resets the cycle at its own start")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-custom-anchor-phases",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const anchorMs = advancedTo + ms.days(10);
		const nextPhaseStartsAt = advancedTo + ms.days(20);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
				{
					billing_cycle_anchor: "phase_start",
					starts_at: nextPhaseStartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(preview.warnings).toContainEqual(cycleResetWarning(anchorMs));

		await autumnV2_4.billing.setPlans(params);

		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectCycleResetPhase({
			ctx,
			customerId,
			anchorMs: nextPhaseStartsAt,
		});
		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			scheduled: [premium.id],
		});
	},
);
