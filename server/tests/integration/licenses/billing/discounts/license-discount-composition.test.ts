/** Contract: paid parent and license scopes stay isolated; inline custom prices are immediately discountable. */
/** Quantity boundaries and mixed percent/fixed stacking bill only eligible paid license quantities. */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { BillingInterval } from "@autumn/shared";
import {
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customLicensePrice,
	DEVELOPER_SEAT_PRICE,
	expectLicenseDiscountPreviewCorrect,
	expectLicensePreviewLineCorrect,
	getPlanStripeProductId,
	getStripeSubscriptionCouponIds,
	PAID_PARENT_PRICE,
	setupPaidParentLicenseScenario,
	VIEWER_SEAT_PRICE,
} from "./licenseDiscountTestUtils";

test.concurrent(
	`${chalk.yellowBright("license discount composition: paid parent and seat scopes stay isolated")}`,
	async () => {
		const customerId = "license-discount-paid-parent-scope";
		const { autumnV1, autumnV2_3, ctx, parent, developerSeat, viewerSeat } =
			await setupPaidParentLicenseScenario({
				customerId,
				idPrefix: "paid-parent-scope",
			});
		const [parentStripeProductId, developerStripeProductId] = await Promise.all(
			[
				getPlanStripeProductId({ ctx, planId: parent.id }),
				getPlanStripeProductId({ ctx, planId: developerSeat.id }),
			],
		);
		const [parentCoupon, developerCoupon] = await Promise.all([
			createPercentCoupon({
				stripeCli: ctx.stripeCli,
				percentOff: 20,
				appliesToProducts: [parentStripeProductId],
			}),
			createPercentCoupon({
				stripeCli: ctx.stripeCli,
				percentOff: 50,
				appliesToProducts: [developerStripeProductId],
			}),
		]);
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: developerSeat.id, quantity: 2 },
				{ license_plan_id: viewerSeat.id, quantity: 2 },
			],
			discounts: [
				{ reward_id: parentCoupon.id },
				{ reward_id: developerCoupon.id },
			],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: parent.id,
			direction: "charge",
			subtotal: PAID_PARENT_PRICE,
			total: PAID_PARENT_PRICE * 0.8,
			discounts: [
				{
					rewardId: parentCoupon.id,
					percentOff: 20,
					amountOff: 10,
				},
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: developerSeat.id,
			direction: "charge",
			subtotal: 2 * DEVELOPER_SEAT_PRICE,
			total: DEVELOPER_SEAT_PRICE,
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
			subtotal: 2 * VIEWER_SEAT_PRICE,
			total: 2 * VIEWER_SEAT_PRICE,
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: 80 });

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
					granted: 2,
					paid_quantity: 2,
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
	`${chalk.yellowBright("license discount composition: inline attach customization is immediately eligible")}`,
	async () => {
		const customerId = "license-discount-inline-attach";
		const parent = products.base({
			id: "inline-attach-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "inline-attach-seat",
			group: "inline-attach-seat-licenses",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
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
		const seatStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: seat.id,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [seatStripeProductId],
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
			customize: {
				upsert_licenses: [customLicensePrice({ planId: seat.id, amount: 25 })],
			},
			discounts: [{ reward_id: coupon.id }],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "charge",
			subtotal: 50,
			total: 25,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 25 }],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: 25,
				interval: BillingInterval.Month,
				isCustom: true,
				stripeProductId: seatStripeProductId,
			},
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 25,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license discount composition: inline update price and quantity use the fresh discount")}`,
	async () => {
		const customerId = "license-discount-inline-update";
		const { autumnV1, autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "inline-update",
				seatPrice: 10,
				includedSeats: 0,
				attachedSeats: 2,
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
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 3 }],
			customize: {
				upsert_licenses: [
					customLicensePrice({ planId: devSeat.id, amount: 30 }),
				],
			},
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
			subtotal: -10,
			total: -20,
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: devSeat.id,
			direction: "charge",
			subtotal: 90,
			total: 45,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 45 }],
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: 25,
			nextCycleTotal: 45,
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
					granted: 3,
					paid_quantity: 3,
				},
			],
		});
		await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: 30,
				interval: BillingInterval.Month,
				isCustom: true,
				stripeProductId: seatStripeProductId,
			},
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
	`${chalk.yellowBright("license discount composition: attach discount carries through price and quantity update")}`,
	async () => {
		const customerId = "license-discount-carried-inline-update";
		const parent = products.base({
			id: "carried-inline-update-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "carried-inline-update-seat",
			group: "carried-inline-update-seat-licenses",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
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
			license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
			discounts: [{ reward_id: coupon.id }],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: seat.id, quantity: 3 }],
			customize: {
				upsert_licenses: [customLicensePrice({ planId: seat.id, amount: 30 })],
			},
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "refund",
			subtotal: -10,
			total: -10,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 10 }],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: seat.id,
			direction: "charge",
			subtotal: 90,
			total: 45,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 45 }],
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: 35,
			nextCycleTotal: 45,
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
		await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: 30,
				interval: BillingInterval.Month,
				isCustom: true,
				stripeProductId: seatStripeProductId,
			},
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
	`${chalk.yellowBright("license discount composition: included-only quantity update discounts paid seats")}`,
	async () => {
		const customerId = "license-discount-included-boundary";
		const { autumnV1, autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "included-boundary",
				seatPrice: 20,
				includedSeats: 2,
				attachedSeats: 2,
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
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 4 }],
			discounts: [{ reward_id: coupon.id }],
		};

		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(preview.line_items).toHaveLength(1);
		expectLicensePreviewLineCorrect({
			preview,
			planId: devSeat.id,
			direction: "charge",
			subtotal: 40,
			total: 20,
			quantity: 2,
			discounts: [{ rewardId: coupon.id, percentOff: 50, amountOff: 20 }],
		});
		expectLicenseDiscountPreviewCorrect({
			preview,
			total: 20,
			nextCycleTotal: null,
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
					granted: 4,
					paid_quantity: 2,
				},
			],
		});
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license discount composition: unrestricted percent and seat-only amount stack by eligibility")}`,
	async () => {
		const customerId = "license-discount-mixed-stacking";
		const { autumnV1, autumnV2_3, ctx, parent, developerSeat, viewerSeat } =
			await setupPaidParentLicenseScenario({
				customerId,
				idPrefix: "mixed-stacking",
			});
		const developerStripeProductId = await getPlanStripeProductId({
			ctx,
			planId: developerSeat.id,
		});
		const [unrestrictedCoupon, developerCoupon] = await Promise.all([
			createPercentCoupon({ stripeCli: ctx.stripeCli, percentOff: 20 }),
			createAmountCoupon({
				stripeCli: ctx.stripeCli,
				amountOffCents: 500,
				appliesToProducts: [developerStripeProductId],
			}),
		]);
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: developerSeat.id, quantity: 2 },
				{ license_plan_id: viewerSeat.id, quantity: 2 },
			],
			discounts: [
				{ reward_id: developerCoupon.id },
				{ reward_id: unrestrictedCoupon.id },
			],
		};

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expectLicensePreviewLineCorrect({
			preview,
			planId: parent.id,
			direction: "charge",
			subtotal: PAID_PARENT_PRICE,
			total: 40,
			discounts: [
				{
					rewardId: unrestrictedCoupon.id,
					percentOff: 20,
					amountOff: 10,
				},
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: developerSeat.id,
			direction: "charge",
			subtotal: 2 * DEVELOPER_SEAT_PRICE,
			total: 27,
			discounts: [
				{
					rewardId: unrestrictedCoupon.id,
					percentOff: 20,
					amountOff: 8,
				},
				{ rewardId: developerCoupon.id, amountOff: 5 },
			],
		});
		expectLicensePreviewLineCorrect({
			preview,
			planId: viewerSeat.id,
			direction: "charge",
			subtotal: 2 * VIEWER_SEAT_PRICE,
			total: 16,
			discounts: [
				{
					rewardId: unrestrictedCoupon.id,
					percentOff: 20,
					amountOff: 4,
				},
			],
		});
		expectLicenseDiscountPreviewCorrect({ preview, total: 83 });

		await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 83,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
