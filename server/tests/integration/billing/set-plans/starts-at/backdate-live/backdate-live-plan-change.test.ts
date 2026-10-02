/**
 * A backdate over a live subscription that also changes plans bills only the difference for the
 * rest of the current period: the old plans' unused time is credited, the new plans charged,
 * and the preview total equals the invoice. The period the old subscription paid isn't rebilled,
 * and the recreated subscription renews on the old date at the new plans' price.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectPlanStartsAt } from "@tests/integration/billing/set-plans/utils/resyncUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an upgrade and a downgrade together bill only their difference to the period end")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const smallAddOn = products.base({
			id: "small-addon",
			isAddOn: true,
			items: [items.monthlyPrice({ price: 5 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-backdate-live-change",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium, addOn, smallAddOn] }),
				],
				actions: [
					s.billing.multiAttach({
						plans: [{ productId: pro.id }, { productId: addOn.id }],
					}),
					s.advanceTestClock({ days: 10 }),
				],
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(5);
		const expectedCharge = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 40,
			newAmount: 55,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: backdatedStart,
					plans: [{ plan_id: premium.id }, { plan_id: smallAddOn.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: preview.total,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: expectedCharge,
		});
		await expectCustomerProducts({
			customerId,
			active: [premium.id, smallAddOn.id],
			notPresent: [pro.id, addOn.id],
		});
		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 55,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{
					startMs: live.periodStartMs,
					endMs: live.periodEndMs,
					total: new Decimal(live.billedTotal).plus(preview.total).toNumber(),
				},
			],
		});
		await expectPlanStartsAt({
			ctx,
			customerId,
			productId: premium.id,
			startsAt: backdatedStart,
		});
		expect(preview.total).toBeGreaterThan(0);
	},
);
