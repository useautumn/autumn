import {
	ErrCode,
	GetBillingPortalQuerySchema,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import z from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { getOrCreateStripeCustomer } from "../../../../external/stripe/customers";
import { toSuccessUrl } from "../../../orgs/orgUtils/convertOrgUtils";
import { CusService } from "../../CusService";

export const handleGetBillingPortal = createRoute({
	query: GetBillingPortalQuerySchema,
	params: z.object({
		customer_id: z.string(),
	}),
	// body: GetBillingPortalBodySchema,
	handler: async (c) => {
		const returnUrl = c.req.valid("query").return_url;
		const customerId = c.req.param().customer_id;
		const ctx = c.get("ctx");
		const [customer] = await Promise.all([
			CusService.get({
				db: ctx.db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		if (!customer) {
			throw new RecaseError({
				message: `Customer ${customerId} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		const stripeCustomer = await getOrCreateStripeCustomer({
			ctx,
			customer,
		});

		const stripeCusId = stripeCustomer.id;

		const portal = await stripeCli.billingPortal.sessions.create({
			customer: stripeCusId,
			return_url: returnUrl || toSuccessUrl({ org: ctx.org, env: ctx.env }),
		});

		return c.json({
			customer_id: customer.id || null,
			url: portal.url,
		});
	},
});
