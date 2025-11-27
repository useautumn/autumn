import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { createStripeCusIfNotExists } from "../../../../external/stripe/stripeCusUtils";
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

			let stripeCusId: string = customer.processor?.id;
			if (!customer.processor?.id) {
				const newCus = await createStripeCusIfNotExists({
					db: req.db,
					org,
					env: req.env,
					customer,
					logger: req.logger,
				});

				if (!newCus) {
					throw new RecaseError({
						message: `Failed to create Stripe customer`,
					});
				}

				stripeCusId = newCus.id;
			}

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
