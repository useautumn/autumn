import {
	AffectedResource,
	CustomerNotFoundError,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { CusService } from "../CusService.js";

/** `source.coupon` is a bare id unless `discounts.source.coupon` is expanded. */
const discountCouponId = (discount: Stripe.Discount) => {
	const coupon = discount.source?.coupon;
	return typeof coupon === "string" ? coupon : (coupon?.id ?? "");
};

export const handleRemoveCouponFromSubscriptionV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id, subscription_id, coupon_id } = c.req.param();

		const customer = await CusService.get({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		if (!customer?.id) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const stripeCli = createStripeCli({ org, env });
		const subscription = await stripeCli.subscriptions.retrieve(
			subscription_id,
			{ expand: ["discounts"] },
		);
		const discounts = subscription.discounts.filter(
			(discount): discount is Stripe.Discount => typeof discount !== "string",
		);

		const subscriptionCustomerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: subscription.customer.id;

		if (subscriptionCustomerId !== customer.processor?.id) {
			throw new RecaseError({
				message: `Subscription ${subscription_id} does not belong to customer ${customer_id}`,
				statusCode: 404,
			});
		}

		const targetCouponId = getOriginalCouponId(coupon_id);
		const matchesTarget = (discount: Stripe.Discount) =>
			getOriginalCouponId(discountCouponId(discount)) === targetCouponId;

		if (!discounts.some(matchesTarget)) {
			throw new RecaseError({
				message: `Coupon ${coupon_id} is not applied to subscription ${subscription_id}`,
				statusCode: 404,
			});
		}

		// Stripe's discounts param is a full replace, so send back the survivors.
		const remainingDiscounts = discounts
			.filter((discount) => !matchesTarget(discount))
			.map((discount) => ({ discount: discount.id }));

		await stripeCli.subscriptions.update(subscription_id, {
			discounts: remainingDiscounts,
		});

		return c.json({ customer });
	},
});
