import { CustomerNotFoundError } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { CusReadService } from "../CusReadService.js";
import { CusService } from "../CusService.js";
export const handleGetCusReferrals = createRoute({
	params: z.object({ customer_id: z.string() }),
	handler: async (c) => {
		const { env, db, org } = c.get("ctx");
		const { customer_id } = c.req.valid("param");

		const internalCustomer = await CusService.get({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customer_id,
		});

		if (!internalCustomer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		// Get all redemptions for this customer
		const [referred, redeemed, stripeCus] = await Promise.all([
			RewardRedemptionService.getByReferrer({
				db,
				internalCustomerId: internalCustomer.internal_id,
				withCustomer: true,
				limit: 100,
			}),
			RewardRedemptionService.getByCustomer({
				db,
				internalCustomerId: internalCustomer.internal_id,
				withReferralCode: true,
				limit: 100,
			}),
			(async () => {
				if (isStripeConnected({ org, env }) && internalCustomer.processor?.id) {
					const stripeCli = createStripeCli({ org, env });
					const stripeCus: any = await stripeCli.customers.retrieve(
						internalCustomer.processor.id,
					);
					return stripeCus;
				}
				return null;
			})(),
		]);

		const redeemedCustomerIds = redeemed.map(
			(redemption: any) => redemption.referral_code.internal_customer_id,
		);

		const redeemedCustomers = await CusReadService.getInInternalIds({
			db,
			internalIds: redeemedCustomerIds,
		});

		for (const redemption of redeemed) {
			if (redemption.referral_code) {
				redemption.referral_code.customer = redeemedCustomers.find(
					(customer: any) =>
						customer.internal_id ===
						redemption.referral_code!.internal_customer_id,
				);
			}
		}

		return c.json({
			referred,
			redeemed,
			stripeCus,
		});
	},
});
