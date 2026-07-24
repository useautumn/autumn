/** Contract: attach discounts cover eligible license charges, product restrictions isolate custom seat types, fresh upgrade discounts skip old credits, and carried discounts cover both sides. */
/** Pre-change, custom seat prices use the parent Stripe product; post-change they use the child product and every assertion below follows that identity. */
import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import {
	createAmountCoupon,
	createPercentCoupon,
	createPromotionCode,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseAttachPreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
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
	`${chalk.yellowBright("license discounts attach: restricted discounts isolate custom seat types")}`,
	async () => {
		const customerId = "license-discount-attach-restricted";
		const parent = products.base({
			id: "restricted-parent",
			items: [items.dashboard()],
		});
		const developerSeat = products.base({
			id: "restricted-developer-seat",
			group: "restricted-developer-licenses",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const viewerSeat = products.base({
			id: "restricted-viewer-seat",
			group: "restricted-viewer-licenses",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
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
			],
		});

		const [developerStripeProductId, viewerStripeProductId] = await Promise.all(
			[
				getPlanStripeProductId({ ctx, planId: developerSeat.id }),
				getPlanStripeProductId({ ctx, planId: viewerSeat.id }),
			],
		);
		const [developerCoupon, viewerCoupon] = await Promise.all([
			createPercentCoupon({
				stripeCli: ctx.stripeCli,
				percentOff: 50,
				appliesToProducts: [developerStripeProductId],
			}),
			createAmountCoupon({
				stripeCli: ctx.stripeCli,
				amountOffCents: 400,
				appliesToProducts: [viewerStripeProductId],
			}),
		]);
		const viewerPromotionCode = await createPromotionCode({
			stripeCli: ctx.stripeCli,
			coupon: viewerCoupon,
			code: `VIEWER4-${customerId}`,
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: developerSeat.id, quantity: 2 },
				{ license_plan_id: viewerSeat.id, quantity: 3 },
			],
			discounts: [
				{ reward_id: developerCoupon.id },
				{ promotion_code: viewerPromotionCode.code },
			],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicenseAttachPreviewCorrect({ preview, total: 40 });

		expectLicensePreviewLineCorrect({
			preview,
			planId: developerSeat.id,
			direction: "charge",
			subtotal: 40,
			total: 20,
			quantity: 2,
			discounts: [
				{
					rewardId: developerCoupon.id,
					percentOff: 50,
					amountOff: 20,
				},
			],
		});

		expectLicensePreviewLineCorrect({
			preview,
			planId: viewerSeat.id,
			direction: "charge",
			subtotal: 24,
			total: 20,
			quantity: 3,
			discounts: [{ rewardId: viewerCoupon.id, amountOff: 4 }],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 2,
			licenses: [
				{
					license_plan_id: developerSeat.id,
					parent_plan_id: parent.id,
					granted: 2,
					paid_quantity: 2,
				},
				{
					license_plan_id: viewerSeat.id,
					parent_plan_id: parent.id,
					granted: 3,
					paid_quantity: 3,
				},
			],
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license discounts attach: fresh upgrade discount applies only to incoming seats")}`,
	async () => {
		const customerId = "license-discount-fresh-upgrade";
		const parentA = products.base({
			id: "fresh-upgrade-parent-a",
			group: "fresh-upgrade-parents",
			items: [items.dashboard()],
		});
		const parentB = products.base({
			id: "fresh-upgrade-parent-b",
			group: "fresh-upgrade-parents",
			items: [items.dashboard()],
		});
		const seatA = products.base({
			id: "fresh-upgrade-seat-a",
			group: "fresh-upgrade-seats",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const seatB = products.base({
			id: "fresh-upgrade-seat-b",
			group: "fresh-upgrade-seats",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
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
					customize: customLicensePriceConfig({ amount: 10 }),
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: seatB.id,
					included: 0,
					customize: customLicensePriceConfig({ amount: 30 }),
				}),
			],
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parentA.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seatA.id, quantity: 2 }],
		});

		const seatBStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: seatB.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [seatBStripeProductId],
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parentB.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seatB.id, quantity: 2 }],
			discounts: [{ reward_id: coupon.id }],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seatA.id,
			direction: "refund",
			subtotal: -20,
			total: -20,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seatB.id,
			direction: "charge",
			subtotal: 60,
			total: 30,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 30 }],
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: 10 });

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
