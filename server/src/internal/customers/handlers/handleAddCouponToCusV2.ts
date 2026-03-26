import {
	AffectedResource,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
	RewardType,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardActions } from "@/internal/rewards/actions/index.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";
import { CusService } from "../CusService.js";

export const handleAddCouponToCusV2 = createRoute({
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

		if (!customer || !customer.id) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		if (!coupon) {
			throw new RecaseError({
				message: `Coupon ${coupon_id} not found`,
			});
		}

		if (coupon.type === RewardType.FeatureGrant) {
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
			});

			return c.json({ customer, coupon });
		}

		const stripeCli = createStripeCli({
			org,
			env,
			legacyVersion: true,
		});

		await getOrCreateStripeCustomer({
			ctx,
			customer,
		});

		// Attach coupon to customer
		await stripeCli.rawRequest(
			"POST",
			`/v1/customers/${customer.processor.id}`,
			{
				coupon: coupon.id,
			},
		);

		return c.json({ customer, coupon });
	},
});
