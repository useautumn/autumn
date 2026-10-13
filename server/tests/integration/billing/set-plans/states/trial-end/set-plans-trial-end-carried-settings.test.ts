/**
 * Ending a trial onto a future anchor recreates the subscription. The new one keeps everything the old one was
 * billed with: collection method and terms, payment method, tax rates, metadata, and discounts as Stripe would
 * have kept applying them.
 *
 * Red (before):  only a paid backdate carried settings, so this recreate dropped them all; a send_invoice
 *                customer became charge_automatically.
 * Green (after): every recreate carries them, and the preview bills what Stripe invoices.
 */

import { expect, test } from "bun:test";
import { stripeRefToId } from "@autumn/shared";
import chalk from "chalk";
import {
	applyDiscount,
	COUPON_PERCENT_OFF,
	discountCouponIds,
	discountPromotionCodeIds,
	expectInvoiceDiscounted,
	expectPreviewMatchesInvoice,
	recreateTrialOnAnchor,
} from "./utils/trialEndCarryUtils";

const DAYS_UNTIL_DUE = 14;
const METADATA = { team: "growth" };

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: send_invoice, days_until_due, tax rates and metadata move to the new subscription")}`,
	async () => {
		let taxRateId = "";
		const { before, recreated, preview, firstInvoice } =
			await recreateTrialOnAnchor({
				customerId: "set-plans-trial-carry-invoice",
				prepare: async ({ ctx, trialing }) => {
					const taxRate = await ctx.stripeCli.taxRates.create({
						display_name: "VAT",
						percentage: 20,
						inclusive: true,
					});
					taxRateId = taxRate.id;
					await ctx.stripeCli.subscriptions.update(trialing.id, {
						collection_method: "send_invoice",
						days_until_due: DAYS_UNTIL_DUE,
						default_tax_rates: [taxRate.id],
						metadata: METADATA,
					});
				},
			});

		expect(before.collection_method).toBe("send_invoice");
		expect({
			collectionMethod: recreated.collection_method,
			daysUntilDue: recreated.days_until_due,
			taxRateIds: recreated.default_tax_rates?.map(({ id }) => id),
			team: recreated.metadata.team,
		}).toEqual({
			collectionMethod: "send_invoice",
			daysUntilDue: DAYS_UNTIL_DUE,
			taxRateIds: [taxRateId],
			team: METADATA.team,
		});
		expect(firstInvoice.collection_method).toBe("send_invoice");
		expect(preview.invoice_mode).toEqual({
			enabled: true,
			net_terms_days: DAYS_UNTIL_DUE,
		});
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: the subscription's own payment method moves to the new subscription")}`,
	async () => {
		let paymentMethodId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-pm",
			prepare: async ({ ctx, trialing, stripeCustomerId }) => {
				const paymentMethod = await ctx.stripeCli.paymentMethods.attach(
					"pm_card_mastercard",
					{ customer: stripeCustomerId },
				);
				paymentMethodId = paymentMethod.id;
				await ctx.stripeCli.subscriptions.update(trialing.id, {
					default_payment_method: paymentMethod.id,
				});
			},
		});

		expect(stripeRefToId(recreated.default_payment_method)).toBe(
			paymentMethodId,
		);
		expect(firstInvoice.status).toBe("paid");
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: an unspent once coupon discounts the new subscription's first invoice")}`,
	async () => {
		let couponId = "";
		const { preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-once",
			prepare: async (scenario) => {
				const coupon = await scenario.ctx.stripeCli.coupons.create({
					percent_off: COUPON_PERCENT_OFF,
					duration: "once",
				});
				couponId = coupon.id;
				await applyDiscount({ ...scenario, discount: { coupon: coupon.id } });
			},
		});

		expect(discountCouponIds(firstInvoice.discounts)).toEqual([couponId]);
		expectInvoiceDiscounted(firstInvoice);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a forever coupon stays on the new subscription")}`,
	async () => {
		let couponId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-forever",
			prepare: async (scenario) => {
				const coupon = await scenario.ctx.stripeCli.coupons.create({
					percent_off: COUPON_PERCENT_OFF,
					duration: "forever",
				});
				couponId = coupon.id;
				await applyDiscount({ ...scenario, discount: { coupon: coupon.id } });
			},
		});

		expect(discountCouponIds(recreated.discounts)).toEqual([couponId]);
		expect(preview.discounts.map(({ id }) => id)).toEqual([couponId]);
		expectInvoiceDiscounted(firstInvoice);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a part-used repeating coupon moves as a copy for its remaining months")}`,
	async () => {
		let couponId = "";
		const { before, recreated, preview, firstInvoice } =
			await recreateTrialOnAnchor({
				customerId: "set-plans-trial-carry-repeating",
				trialDays: 45,
				daysIntoTrial: 35,
				prepare: async (scenario) => {
					const coupon = await scenario.ctx.stripeCli.coupons.create({
						percent_off: COUPON_PERCENT_OFF,
						duration: "repeating",
						duration_in_months: 3,
					});
					couponId = coupon.id;
					await applyDiscount({ ...scenario, discount: { coupon: coupon.id } });
				},
			});

		// The old discount reaches the trial-end renewal and the one after: two months from now.
		const [carried] = recreated.discounts;
		const carriedCoupon =
			typeof carried === "string" ? undefined : carried?.source?.coupon;
		expect(carriedCoupon).toMatchObject({
			id: `${couponId}_${before.id}_2m`,
			percent_off: COUPON_PERCENT_OFF,
			duration: "repeating",
			duration_in_months: 2,
		});
		expectInvoiceDiscounted(firstInvoice);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a promotion code Stripe still accepts is redeemed again")}`,
	async () => {
		let promotionCodeId = "";
		let couponId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-promo",
			prepare: async (scenario) => {
				const coupon = await scenario.ctx.stripeCli.coupons.create({
					percent_off: COUPON_PERCENT_OFF,
					duration: "forever",
				});
				const promotionCode =
					await scenario.ctx.stripeCli.promotionCodes.create({
						promotion: { type: "coupon", coupon: coupon.id },
					});
				couponId = coupon.id;
				promotionCodeId = promotionCode.id;
				await applyDiscount({
					...scenario,
					discount: { promotion_code: promotionCode.id },
				});
			},
		});

		expect({
			coupons: discountCouponIds(recreated.discounts),
			promotionCodes: discountPromotionCodeIds(recreated.discounts),
		}).toEqual({ coupons: [couponId], promotionCodes: [promotionCodeId] });
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a used-up promotion code falls back to its coupon")}`,
	async () => {
		let couponId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-promo-used",
			prepare: async (scenario) => {
				const coupon = await scenario.ctx.stripeCli.coupons.create({
					percent_off: COUPON_PERCENT_OFF,
					duration: "forever",
				});
				const promotionCode =
					await scenario.ctx.stripeCli.promotionCodes.create({
						promotion: { type: "coupon", coupon: coupon.id },
						max_redemptions: 1,
					});
				couponId = coupon.id;
				await applyDiscount({
					...scenario,
					discount: { promotion_code: promotionCode.id },
				});
			},
		});

		expect({
			coupons: discountCouponIds(recreated.discounts),
			promotionCodes: discountPromotionCodeIds(recreated.discounts),
		}).toEqual({ coupons: [couponId], promotionCodes: [undefined] });
		expectInvoiceDiscounted(firstInvoice);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a requested discount is added to the carried one, as in attach")}`,
	async () => {
		let carriedCouponId = "";
		let requestedCouponId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-add",
			prepare: async (scenario) => {
				const [carried, requested] = await Promise.all(
					[25, 10].map((percent_off) =>
						scenario.ctx.stripeCli.coupons.create({
							percent_off,
							duration: "forever",
						}),
					),
				);
				carriedCouponId = carried!.id;
				requestedCouponId = requested!.id;
				await applyDiscount({ ...scenario, discount: { coupon: carried!.id } });
			},
			requestParams: () => ({ discounts: [{ reward_id: requestedCouponId }] }),
		});

		expect(discountCouponIds(recreated.discounts).sort()).toEqual(
			[carriedCouponId, requestedCouponId].sort(),
		);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: remove_discounts drops a discount instead of carrying it")}`,
	async () => {
		let couponId = "";
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-remove",
			prepare: async (scenario) => {
				const coupon = await scenario.ctx.stripeCli.coupons.create({
					percent_off: COUPON_PERCENT_OFF,
					duration: "forever",
				});
				couponId = coupon.id;
				await applyDiscount({ ...scenario, discount: { coupon: coupon.id } });
			},
			requestParams: () => ({ remove_discounts: [{ reward_id: couponId }] }),
		});

		expect(recreated.discounts).toEqual([]);
		expect(firstInvoice.total_discount_amounts ?? []).toEqual([]);
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end carry: a requested invoice_mode decides the collection instead of the carried one")}`,
	async () => {
		const requestedNetTerms = 30;
		const { recreated, preview, firstInvoice } = await recreateTrialOnAnchor({
			customerId: "set-plans-trial-carry-invoice-mode",
			prepare: ({ ctx, trialing }) =>
				ctx.stripeCli.subscriptions.update(trialing.id, {
					collection_method: "send_invoice",
					days_until_due: DAYS_UNTIL_DUE,
				}),
			requestParams: () => ({
				invoice_mode: {
					enabled: true,
					net_terms_days: requestedNetTerms,
					enable_plan_immediately: true,
				},
			}),
		});

		expect({
			collectionMethod: recreated.collection_method,
			daysUntilDue: recreated.days_until_due,
		}).toEqual({
			collectionMethod: "send_invoice",
			daysUntilDue: requestedNetTerms,
		});
		expectPreviewMatchesInvoice({ preview, firstInvoice });
	},
);
