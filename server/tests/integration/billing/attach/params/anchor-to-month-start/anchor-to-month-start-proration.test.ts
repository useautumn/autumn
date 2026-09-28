/**
 * `proration_behavior: "none"` on a month-start attach charges nothing until the 1st.
 *
 * Contract:
 *   preview total 0 → sub anchored to the 1st → no invoice at attach → access granted now,
 *   resets on the 1st
 *   with a one-off purchase: Stripe defers it to the anchor too, so nothing is previewed
 *   or invoiced now and the first invoice on the 1st carries the month plus the purchase
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const EXACT_MS = 1000;

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start proration 1: proration_behavior none charges nothing until the 1st")}`,
	async () => {
		const customerId = "anchor-month-no-proration";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			proration_behavior: "none",
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expect(preview.total).toBe(0);

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: pro.id,
			nextResetAt: monthStartMs,
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start proration 2: proration_behavior none defers a one-off purchase to the 1st")}`,
	async () => {
		const customerId = "anchor-month-no-proration-one-off";
		const PRO_MONTHLY_PRICE = 20;
		const ONE_OFF_PACK_PRICE = 50;
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [
					items.monthlyMessages({ includedUsage: 100 }),
					items.oneOffWords({ billingUnits: 100, price: ONE_OFF_PACK_PRICE }),
				],
			}),
		);

		const { autumnV2_3, autumnV1, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			proration_behavior: "none",
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expect(preview.total).toBe(0);
		// Known gap: next_cycle previews the month only; Stripe also bills the deferred purchase.
		expectPreviewNextCycleCorrect({ preview, startsAt: monthStartMs });

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: monthStartMs,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE + ONE_OFF_PACK_PRICE,
		});
	},
);
