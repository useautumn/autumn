import { CouponDurationType, type Reward, RewardType } from "@autumn/shared";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";

import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { stripeCustomerToNowMs } from "@/external/stripe/customers/index.js";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { generateId } from "@/utils/genUtils.js";
import {
	deleteCouponFromCus,
	deleteCouponFromSub,
} from "../../../stripeCouponUtils/deleteCouponFromCus.js";

/** @deprecated This discount rollover logic will be deprecated soon */
export const handleStripeInvoiceDiscounts = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}) => {
	// Handle coupon
	const { org, env, logger } = ctx;
	const { stripeInvoice, stripeSubscriptionId } = invoicePaidContext;
	const stripeCli = createStripeCli({ org, env, legacyVersion: true });
	if (stripeInvoice.discounts.length === 0) return;

	const stripeCus = await stripeCli.customers.retrieve(
		stripeInvoice.customer as string,
	);

	const legacyInvoice = await stripeCli.invoices.retrieve(stripeInvoice.id, {
		expand: ["total_discount_amounts", "discounts.coupon"],
	});

	try {
		const totalDiscountAmounts = legacyInvoice.total_discount_amounts;

		// Log coupon information for debugging
		for (const discount of legacyInvoice.discounts) {
			if (typeof discount === "string" || !("coupon" in discount)) continue;

			const curCoupon = discount.coupon as Stripe.Coupon;

			if (!curCoupon || typeof curCoupon === "string" || !curCoupon.amount_off)
				continue;

			const rollSuffixIndex = curCoupon.id.indexOf("_roll_");
			const couponId =
				rollSuffixIndex !== -1
					? curCoupon.id.substring(0, rollSuffixIndex)
					: curCoupon.id;

			const autumnReward: Reward | null = await RewardService.get({
				db: ctx.db,
				idOrInternalId: couponId,
				orgId: org.id,
				env,
			});

			const shouldRollover =
				autumnReward &&
				(autumnReward.type === RewardType.InvoiceCredits ||
					autumnReward.type === RewardType.FreeProduct);

			if (!shouldRollover) continue;

			// Get ID of coupon
			const originalCoupon = await stripeCli.coupons.retrieve(couponId, {
				expand: ["applies_to"],
			});

			const curAmount = curCoupon.amount_off;

			const amountUsed = totalDiscountAmounts?.find(
				(item) => item.discount === discount.id,
			)?.amount;

			const newAmount = new Decimal(curAmount!).sub(amountUsed!).toNumber();

			const curExpiresAt = curCoupon.metadata?.expires_at
				? Number(curCoupon.metadata.expires_at)
				: null;

			const discountFinished = newAmount <= 0;

			const now = await stripeCustomerToNowMs({
				stripeCli,
				stripeCustomer: stripeCus as Stripe.Customer,
			});

			const expired = curExpiresAt && curExpiresAt < now;

			if (discountFinished || expired) {
				logger.info(
					`Coupon ${couponId}, stripeCus: ${stripeCus.id}: credits used up or expired. discountFinished: ${discountFinished}, expired: ${expired}`,
				);

				if (stripeSubscriptionId) {
					await deleteCouponFromCus({
						stripeCli,
						stripeSubId: stripeSubscriptionId!,
						stripeCusId: stripeInvoice.customer as string,
						discountId: discount.id,
						logger,
					});
				}

				continue;
			}

			logger.info(
				`Coupon ${couponId}, stripeCus: ${stripeCus.id}, updating amount from ${curAmount} to ${newAmount}`,
			);

			// Set expiry date
			let expiresAt = curCoupon.metadata?.expires_at || null;
			const discountConfig = autumnReward?.discount_config;
			if (discountConfig?.duration_type === CouponDurationType.Months) {
				expiresAt = addMonths(new Date(), discountConfig.duration_value)
					.getTime()
					.toString();
			}

			const newCoupon = await stripeCli.coupons.create({
				id: `${couponId}_${generateId("roll")}`,
				name: curCoupon.name as string,
				amount_off: newAmount,
				currency: stripeInvoice.currency,
				duration: "once",
				applies_to: originalCoupon.applies_to,
				metadata: {
					expires_at: expiresAt,
				},
			});

			await stripeCli.rawRequest(
				"POST",
				`/v1/customers/${stripeInvoice.customer}`,
				{
					coupon: newCoupon.id,
				},
			);

			await stripeCli.coupons.del(newCoupon.id);

			if (stripeSubscriptionId) {
				await deleteCouponFromSub({
					stripeCli,
					stripeSubId: stripeSubscriptionId!,
					discountId: discount.id,
					logger,
				});
			}
		}
	} catch (error) {
		logger.error("invoice.paid: error updating coupon");
		logger.error(error);
	}
};
