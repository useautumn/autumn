/**
 * A backdated plan with a one-off setup fee, billed as Stripe bills it: prorate_immediately charges every
 * cycle plus the fee now; none charges nothing now and leaves the fee pending on the first renewal invoice.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { subHours, subMonths } from "date-fns";
import { Decimal } from "decimal.js";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import { testClockNowMs } from "../utils/futureStartUtils";
import {
	backdateParams,
	expectedNewBackdateCharge,
	expectNewBackdateBilledCorrect,
	expectRenewalInvoiceTotal,
	PRO_MONTHLY_PRICE,
} from "./utils/backdateNewUtils";

const SETUP_FEE = 50;
const SETUP_FEE_UNITS = 1;
const BACKDATED_MONTHS = 2;
const HOURS_BEFORE_NOW = 1;

for (const prorationBehavior of [
	"none",
	"prorate_immediately",
] as const satisfies BackdateProrationBehavior[]) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate new: a setup fee with ${prorationBehavior} is billed like Stripe bills it`)}`,
		async () => {
			const customerId = `set-plans-backdate-new-one-off-${prorationBehavior}`;
			const proWithSetupFee = products.pro({
				items: [
					items.oneOffMessages({
						billingUnits: SETUP_FEE_UNITS,
						price: SETUP_FEE,
					}),
				],
			});
			const { autumnV1, autumnV2_4, ctx, testClockId } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proWithSetupFee] }),
				],
				actions: [],
			});
			const nowMs = await testClockNowMs({ ctx, testClockId: testClockId! });
			const startMs = subHours(
				subMonths(nowMs, BACKDATED_MONTHS),
				HOURS_BEFORE_NOW,
			).getTime();
			const params = backdateParams({
				customerId,
				planId: proWithSetupFee.id,
				startsAt: startMs,
				prorationBehavior,
				featureQuantities: [
					{ feature_id: TestFeature.Messages, quantity: SETUP_FEE_UNITS },
				],
			});

			const billsNow = prorationBehavior !== "none";
			const preview = await autumnV2_4.billing.previewSetPlans(params);
			await autumnV2_4.billing.setPlans(params);

			await expectNewBackdateBilledCorrect({
				ctx,
				autumnV1,
				customerId,
				startMs,
				nowMs,
				previewTotal: preview.total,
				expectedCharge: billsNow
					? new Decimal(
							expectedNewBackdateCharge({ startMs, nowMs, prorationBehavior }),
						)
							.plus(SETUP_FEE)
							.toNumber()
					: 0,
			});
			if (!billsNow) {
				await expectRenewalInvoiceTotal({
					ctx,
					customerId,
					total: new Decimal(SETUP_FEE).plus(PRO_MONTHLY_PRICE).toNumber(),
				});
			}
		},
	);
}
