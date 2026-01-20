import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { getOrCreateStripeCustomer } from "../../../../external/stripe/customers";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { routeHandler } from "../../../../utils/routerUtils";
import { OrgService } from "../../../orgs/OrgService";
import { toSuccessUrl } from "../../../orgs/orgUtils/convertOrgUtils";
import { CusService } from "../../CusService";

export const handleGetBillingPortal = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get billing portal",
		handler: async (req, res) => {
			const returnUrl = req.query.return_url;
			const customerId = req.params.customer_id;
			const [org, customer] = await Promise.all([
				OrgService.getFromReq(req),
				CusService.get({
					db: req.db,
					idOrInternalId: customerId,
					orgId: req.orgId,
					env: req.env,
				}),
			]);

			if (!customer) {
				throw new RecaseError({
					message: `Customer ${customerId} not found`,
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			const stripeCli = createStripeCli({ org, env: req.env });

			const stripeCustomer = await getOrCreateStripeCustomer({
				ctx: req as AutumnContext,
				customer,
			});

			const stripeCusId = stripeCustomer.id;

			const portal = await stripeCli.billingPortal.sessions.create({
				customer: stripeCusId,
				return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
			});

			res.status(200).json({
				customer_id: customer.id || null,
				url: portal.url,
			});
		},
	});
