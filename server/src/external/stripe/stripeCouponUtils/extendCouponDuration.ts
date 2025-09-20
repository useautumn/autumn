// import Stripe from "stripe";

// /**
//  * Extends an existing coupon's duration by replacing it with a new coupon that has
//  * the remaining duration + additional months. This avoids concurrent stacking issues.
//  */
// export const extendCouponDuration = async ({
//   stripeCli,
//   sub,
//   existingCouponId,
//   additionalMonths,
//   logger,
// }: {
//   stripeCli: Stripe;
//   sub: Stripe.Subscription;
//   existingCouponId: string;
//   additionalMonths: number;
//   logger: any;
// }): Promise<{
//   success: boolean;
//   newCouponId?: string;
//   error?: string;
// }> => {
//   try {
//     logger.info(
//       `Extending coupon ${existingCouponId} by ${additionalMonths} months`
//     );

//     // Get current subscription and coupon details
//     const existingCoupon = await stripeCli.coupons.retrieve(existingCouponId);
//     const currentDiscounts = (sub.discounts as Stripe.Discount[]) || [];
//     const existingDiscount = currentDiscounts.find((d: any) =>
//       d.coupon?.id.startsWith(existingCouponId)
//     );

//     if (!existingDiscount) {
//       return {
//         success: false,
//         error: "Original coupon not found on subscription",
//       };
//     }

//     // Calculate remaining months using the discount's actual start and end times
//     const originalDurationMonths = existingCoupon.duration_in_months || 0;

//     // Use discount start and end times for accurate calculation
//     const discountStart = new Date(existingDiscount.start * 1000);
//     const discountEnd = existingDiscount.end
//       ? new Date(existingDiscount.end * 1000)
//       : null;
//     const now = new Date();

//     let remainingMonths: number;

//     if (discountEnd) {
//       // Calculate remaining time in months
//       const remainingTimeMs = Math.max(
//         0,
//         discountEnd.getTime() - now.getTime()
//       );
//       remainingMonths = Math.ceil(remainingTimeMs / (30 * 24 * 60 * 60 * 1000));
//     } else {
//       // If no end date (shouldn't happen for repeating coupons), fall back to original duration
//       remainingMonths = originalDurationMonths;
//     }

//     const totalNewDurationMonths = remainingMonths + additionalMonths;

//     logger.info(
//       `Discount period: ${discountStart.toISOString()} to ${discountEnd?.toISOString() || "forever"}`
//     );
//     logger.info(
//       `Original: ${originalDurationMonths}m, Remaining: ${remainingMonths}m, Adding: ${additionalMonths}m, Total: ${totalNewDurationMonths}m`
//     );

//     // Create a new coupon with the extended duration
//     const extendedCouponId = `${existingCouponId}_${Date.now()}`;
//     const couponCreateParams: Stripe.CouponCreateParams = {
//       id: extendedCouponId,
//       duration: "repeating",
//       duration_in_months: totalNewDurationMonths,
//       name: `Extended ${existingCoupon.name || "Coupon"}`,
//       // metadata: {
//       //   original_coupon_id: existingCouponId,
//       //   original_duration: originalDurationMonths.toString(),
//       //   remaining_months: remainingMonths.toString(),
//       //   additional_months: additionalMonths.toString(),
//       //   total_duration: totalNewDurationMonths.toString(),
//       //   extended_at: Date.now().toString(),
//       // },
//     };

//     // Copy discount value from the existing coupon
//     if (existingCoupon.percent_off) {
//       couponCreateParams.percent_off = existingCoupon.percent_off;
//     } else if (existingCoupon.amount_off) {
//       couponCreateParams.amount_off = existingCoupon.amount_off;
//       if (existingCoupon.currency) {
//         couponCreateParams.currency = existingCoupon.currency;
//       }
//     }

//     // Copy applies_to if it exists
//     if (existingCoupon.applies_to) {
//       couponCreateParams.applies_to = existingCoupon.applies_to;
//     }

//     const extendedCoupon = await stripeCli.coupons.create(couponCreateParams);

//     // Replace the existing coupon with the extended one
//     const otherDiscounts = currentDiscounts
//       .filter((d: any) => d.coupon?.id !== existingCouponId)
//       .map((d: Stripe.Discount) => ({ discount: d.id }));

//     await stripeCli.subscriptions.update(sub.id, {
//       discounts: [...otherDiscounts, { coupon: extendedCoupon.id }],
//     });

//     logger.info(
//       `Successfully extended coupon duration to ${totalNewDurationMonths} months. New coupon ID: ${extendedCouponId}`
//     );

//     await stripeCli.coupons.del(existingCouponId);

//     return { success: true, newCouponId: extendedCouponId };
//   } catch (error: any) {
//     logger.error(`Failed to extend coupon duration: ${error.message}`, error);
//     return { success: false, error: error.message };
//   }
// };
