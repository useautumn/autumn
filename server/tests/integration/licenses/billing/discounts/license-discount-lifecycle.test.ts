/** Contract: license coupons follow Stripe renewal expiry, and later updates never resurrect an expired discount. */
/** Upgrade credits use stored post-discount invoice amounts so refunds cannot exceed what the customer paid. */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectLicenseDiscountPreviewCorrect,
	expectLicensePreviewLineCorrect,
	getPlanStripeProductId,
	getStripeSubscriptionCouponIds,
} from "./licenseDiscountTestUtils";

test.concurrent(
	`${chalk.yellowBright("license discount lifecycle: once coupon expires before renewal and later quantity updates")}`,
	async () => {
		const customerId = "license-discount-once-renewal";
		const parent = products.base({
			id: "once-renewal-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "once-renewal-seat",
			group: "once-renewal-seat-licenses",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
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
			percentOff: 50,
			duration: "once",
			appliesToProducts: [seatStripeProductId],
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
			discounts: [{ reward_id: coupon.id }],
		});
		let customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 20,
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: billingPeriod.end,
			waitForSeconds: 30,
		});
		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: 40,
		});
		const { subscription } = await getStripeSubscription({ customerId });
		expect(getStripeSubscriptionCouponIds(subscription)).not.toContain(
			coupon.id,
		);

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: seat.id, quantity: 3 }],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "refund",
			subtotal: -40,
			total: -40,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "charge",
			subtotal: 60,
			total: 60,
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: 20,
			nextCycleTotal: 60,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 3,
					paid_quantity: 3,
				},
			],
		});
		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("license discount lifecycle: first-cycle upgrade refunds the discounted amount actually paid")}`,
	async () => {
		const customerId = "license-discount-actual-paid-refund";
		const parentA = products.base({
			id: "actual-paid-parent-a",
			group: "actual-paid-parents",
			items: [items.dashboard()],
		});
		const parentB = products.base({
			id: "actual-paid-parent-b",
			group: "actual-paid-parents",
			items: [items.dashboard()],
		});
		const seatA = products.base({
			id: "actual-paid-seat-a",
			group: "actual-paid-seats",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const seatB = products.base({
			id: "actual-paid-seat-b",
			group: "actual-paid-seats",
			items: [items.monthlyPrice({ price: 30 })],
		});
		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [parentA, parentB, seatA, seatB] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: seatA.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: seatB.id,
					included: 0,
				}),
			],
		});
		if (!testClockId) throw new Error("Expected a Stripe test clock");
		const seatAStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: seatA.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [seatAStripeProductId],
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seatA.id, quantity: 2 }],
			discounts: [{ reward_id: coupon.id }],
		});
		let customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 20,
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: (billingPeriod.start + billingPeriod.end) / 2,
			waitForSeconds: 20,
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seatB.id, quantity: 2 }],
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seatA.id,
			direction: "refund",
			subtotal: -10,
			total: -10,
			discounts: [
				{ rewardId: coupon.id, percentOff: 50, amountOff: 20 },
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seatB.id,
			direction: "charge",
			subtotal: 30,
			total: 30,
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: 20 });

		await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [parentB.id],
			notPresent: [parentA.id],
		});
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seatB.id,
					parent_plan_id: parentB.id,
					granted: 2,
					paid_quantity: 2,
				},
			],
		});
		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
	300_000,
);
