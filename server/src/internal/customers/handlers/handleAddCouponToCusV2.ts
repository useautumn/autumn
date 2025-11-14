import {
	AffectedResource,
	CustomerNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RewardService } from "../../rewards/RewardService.js";
import { CusService } from "../CusService.js";

export const handleAddCouponToCusV2 = createRoute({
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, logger } = ctx;
		const { customer_id, coupon_id } = c.req.param();

		const [customer, coupon] = await Promise.all([
			CusService.get({
				db,
				idOrInternalId: customer_id,
				orgId: org.id,
				env,
			}),
			RewardService.get({
				db,
				idOrInternalId: coupon_id,
				orgId: org.id,
				env,
			}),
		]);

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		if (!coupon) {
			throw new RecaseError({
				message: `Coupon ${coupon_id} not found`,
			});
		}

		const stripeCli = createStripeCli({
			org,
			env,
			legacyVersion: true,
		});

		await createStripeCusIfNotExists({
			db,
			org,
			env,
			customer,
			logger,
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
