/** A subscription cancelled in Stripe is rebuilt on its old start, anchored on its old period end, with no charge now. */

import { test } from "bun:test";
import type { SetPlansParamsV0Input } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	cancelSubscriptionForResync,
	expectPlanStartsAt,
	expectResyncedSubscriptionCorrect,
} from "../utils/resyncUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans resync: pro cancelled 10 days in is rebuilt on its old start and anchor")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-pro",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const { oldSubscriptionId, oldStartMs, oldPeriodEndMs } =
			await cancelSubscriptionForResync({ ctx, customerId });

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: oldPeriodEndMs,
					proration_behavior: "none",
					starts_at: oldStartMs,
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			startMs: oldStartMs,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerProducts({ customerId, active: [pro.id] });
		await expectPlanStartsAt({
			ctx,
			customerId,
			productId: pro.id,
			startsAt: oldStartMs,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync: pro, add-on and prepaid are rebuilt with matching Stripe quantities")}`,
	async () => {
		const pro = products.pro({
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.prepaidMessages({ billingUnits: 100, price: 10 }),
			],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const prepaidQuantity = 200;

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-addon-prepaid",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, addOn] }),
				],
				actions: [
					s.billing.attach({
						productId: pro.id,
						options: [
							{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
						],
					}),
					s.billing.attach({ productId: addOn.id }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const { oldSubscriptionId, oldStartMs, oldPeriodEndMs } =
			await cancelSubscriptionForResync({ ctx, customerId });

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: oldPeriodEndMs,
					proration_behavior: "none",
					starts_at: oldStartMs,
					plans: [
						{
							plan_id: pro.id,
							feature_quantities: [
								{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
							],
						},
						{ plan_id: addOn.id },
					],
				},
			],
		});

		await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			startMs: oldStartMs,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerProducts({ customerId, active: [pro.id, addOn.id] });
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 60,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync: annual pro cancelled 3 months in anchors months ahead with no charge")}`,
	async () => {
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-resync-annual",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 3 }),
			],
		});

		const { oldSubscriptionId, oldStartMs, oldPeriodEndMs } =
			await cancelSubscriptionForResync({ ctx, customerId });

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: oldPeriodEndMs,
					proration_behavior: "none",
					starts_at: oldStartMs,
					plans: [{ plan_id: proAnnual.id }],
				},
			],
		});

		await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			startMs: oldStartMs,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerProducts({ customerId, active: [proAnnual.id] });
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
