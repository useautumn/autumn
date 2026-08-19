import {
	AffectedResource,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
	RewardType,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { resolveCoupon } from "@/external/stripe/coupons";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardActions } from "@/internal/rewards/actions/index.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { CusService } from "../CusService.js";

export const handleAddCouponToCusV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	resource: AffectedResource.Customer,
	body: z.object({
		promo_code: z.string().min(1).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id, coupon_id } = c.req.param();
		const { promo_code } = c.req.valid("json");

		const [customer, coupon] = await Promise.all([
			CusService.get({
				db,
				idOrInternalId: customer_id,
				orgId: org.id,
				env,
			}),
			rewardRepo.get({
				db,
				idOrInternalId: coupon_id,
				orgId: org.id,
				env,
			}),
		]);

		if (!customer?.id) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		if (coupon?.type === RewardType.FeatureGrant) {
			if (!promo_code) {
				throw new RecaseError({
					message: "Promo code is required for feature grant rewards",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			await rewardActions.redeemPromoCode({
				ctx,
				code: promo_code,
				customerId: customer.id,
				rewardInternalId: coupon.internal_id,
			});

			return c.json({ customer, coupon });
		}

		// Autumn reward ids double as Stripe coupon ids, so a single Stripe
		// lookup covers both Autumn rewards and Stripe-only coupons.
		const { source } = await resolveCoupon({
			stripeCli: createStripeCli({ org, env }),
			couponId: coupon?.id ?? coupon_id,
		});

		const legacyStripeCli = createStripeCli({
			org,
			env,
			legacyVersion: true,
		});

		await getOrCreateStripeCustomer({
			ctx,
			customer,
		});

		// Attach coupon to customer
		await legacyStripeCli.rawRequest(
			"POST",
			`/v1/customers/${customer.processor.id}`,
			{
				coupon: source.coupon.id,
			},
		);

		return c.json({ customer, coupon: coupon ?? source.coupon });
	},
});
