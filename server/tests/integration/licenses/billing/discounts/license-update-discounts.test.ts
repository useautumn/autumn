/** Contract: license quantity updates apply fresh and carried discounts, persist new coupons, and respect product restrictions across custom seat types. */
/** Pre-change, restricted custom-seat coupons miss their line items; post-change preview, invoice, pool, and Stripe subscription state agree. */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
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
	getStripeSubscriptionCouponIds,
} from "./licenseDiscountTestUtils";

test.concurrent(
	`${chalk.yellowBright("license discounts update: fresh discount applies to a quantity increase and persists")}`,
	async () => {
		const customerId = "license-discount-update-fresh";
		const { autumnV1, autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "license-discount-update-fresh",
				seatPrice: 20,
				includedSeats: 1,
				attachedSeats: 3,
				testClock: true,
			});
		const seatStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: devSeat.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [seatStripeProductId],
		});
		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 6 }],
			discounts: [{ reward_id: coupon.id }],
		};

		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expectLicensePreviewLineCorrect({
			preview,
			planId: devSeat.id,
			direction: "refund",
			subtotal: -40,
			total: -40,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: devSeat.id,
			direction: "charge",
			subtotal: 100,
			total: 50,
			discounts: [
				{ rewardId: coupon.id, percentOff: 50, amountOff: 50 },
			],
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: 10,
			nextCycleTotal: 50,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: parent.id,
					granted: 6,
					paid_quantity: 5,
				},
			],
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: preview.total,
		});
		const { subscription } = await getStripeSubscription({
			customerId,
			expand: ["data.discounts.source.coupon"],
		});
		expect(getStripeSubscriptionCouponIds(subscription)).toContain(coupon.id);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license discounts update: restriction isolates one custom seat quantity change")}`,
	async () => {
		const customerId = "license-discount-update-restricted";
		const parent = products.base({
			id: "update-restricted-parent",
			items: [items.dashboard()],
		});
		const developerSeat = products.base({
			id: "update-restricted-developer-seat",
			group: "update-restricted-developer-licenses",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const viewerSeat = products.base({
			id: "update-restricted-viewer-seat",
			group: "update-restricted-viewer-licenses",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [parent, developerSeat, viewerSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: developerSeat.id,
					included: 0,
					customize: customLicensePriceConfig({ amount: 20 }),
				}),
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: viewerSeat.id,
					included: 0,
					customize: customLicensePriceConfig({ amount: 8 }),
				}),
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [
						{ licenseProductId: developerSeat.id, quantity: 2 },
						{ licenseProductId: viewerSeat.id, quantity: 2 },
					],
				}),
			],
		});

		const developerStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: developerSeat.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [developerStripeProductId],
		});
		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [
				{ license_plan_id: developerSeat.id, quantity: 3 },
				{ license_plan_id: viewerSeat.id, quantity: 3 },
			],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expectLicensePreviewLineCorrect({
			preview,
			planId: developerSeat.id,
			direction: "refund",
			subtotal: -40,
			total: -40,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: developerSeat.id,
			direction: "charge",
			subtotal: 60,
			total: 30,
			discounts: [
				{ rewardId: coupon.id, percentOff: 50, amountOff: 30 },
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: viewerSeat.id,
			direction: "refund",
			subtotal: -16,
			total: -16,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: viewerSeat.id,
			direction: "charge",
			subtotal: 24,
			total: 24,
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: -2 });

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 2,
			licenses: [
				{
					license_plan_id: developerSeat.id,
					granted: 3,
					paid_quantity: 3,
				},
				{
					license_plan_id: viewerSeat.id,
					granted: 3,
					paid_quantity: 3,
				},
			],
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license discounts update: carried discount reduces both sides of a quantity decrease")}`,
	async () => {
		const customerId = "license-discount-update-carried";
		const parent = products.base({
			id: "update-carried-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "update-carried-seat",
			group: "update-carried-seat-licenses",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
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
			percentOff: 50,
			appliesToProducts: [seatStripeProductId],
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seat.id, quantity: 3 }],
			discounts: [{ reward_id: coupon.id }],
		});
		const { billingPeriod } = await getBillingPeriod({ customerId });
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: billingPeriod.end,
			waitForSeconds: 30,
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: seat.id, quantity: 1 }],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "refund",
			subtotal: -30,
			total: -30,
			discounts: [
				{ rewardId: coupon.id, percentOff: 50, amountOff: 30 },
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "charge",
			subtotal: 20,
			total: 10,
			discounts: [
				{ rewardId: coupon.id, percentOff: 50, amountOff: 10 },
			],
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: -20,
			nextCycleTotal: 10,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					granted: 1,
					paid_quantity: 1,
				},
			],
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
	300_000,
);
