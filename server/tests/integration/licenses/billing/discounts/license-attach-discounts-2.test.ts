/** Contract (slice 2 of 2): carried discounts cover both the refunded and the incoming custom seat prices. */
/** Pre-change, custom seat prices use the parent Stripe product; post-change they use the child product and every assertion below follows that identity. */
import { test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customLicensePriceConfig,
	expectLicenseDiscountPreviewCorrect,
	expectLicensePreviewLineCorrect,
	getPlanStripeProductId,
} from "./licenseDiscountTestUtils";

test.concurrent(
	`${chalk.yellowBright("license discounts attach: carried discount covers old and new custom seat prices")}`,
	async () => {
		const customerId = "license-discount-carried-upgrade";
		const parentA = products.base({
			id: "carried-upgrade-parent-a",
			group: "carried-upgrade-parents",
			items: [items.dashboard()],
		});
		const parentB = products.base({
			id: "carried-upgrade-parent-b",
			group: "carried-upgrade-parents",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "carried-upgrade-seat",
			group: "carried-upgrade-seats",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [parentA, parentB, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: seat.id,
					included: 0,
					customize: customLicensePriceConfig({ amount: 10 }),
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: seat.id,
					included: 0,
					customize: customLicensePriceConfig({ amount: 20 }),
				}),
			],
		});

		if (!testClockId) throw new Error("Expected a Stripe test clock");

		const seatStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: seat.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 20,
			appliesToProducts: [seatStripeProductId],
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
			discounts: [{ reward_id: coupon.id }],
		});

		const { billingPeriod: firstBillingPeriod } = await getBillingPeriod({
			customerId,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: firstBillingPeriod.end,
			waitForSeconds: 30,
		});
		const { billingPeriod: renewedBillingPeriod } = await getBillingPeriod({
			customerId,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: (renewedBillingPeriod.start + renewedBillingPeriod.end) / 2,
			waitForSeconds: 20,
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "refund",
			subtotal: -8,
			total: -8,
			discounts: [{ rewardId: coupon.id, percentOff: 20, amountOff: 4 }],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "charge",
			subtotal: 20,
			total: 16,
			discounts: [{ rewardId: coupon.id, percentOff: 20, amountOff: 4 }],
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: 8 });

		await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
