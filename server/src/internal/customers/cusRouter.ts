import { ErrCode } from "@autumn/shared";
import { Router } from "express";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { toSuccessUrl } from "../orgs/orgUtils/convertOrgUtils.js";
import { CusService } from "./CusService.js";
import { handleAddCouponToCus } from "./handlers/handleAddCouponToCus.js";
import { handleCreateBillingPortal } from "./handlers/handleCreateBillingPortal.js";
import { handleDeleteCustomer } from "./handlers/handleDeleteCustomer.js";
import { handleGetCustomerV2 } from "./handlers/handleGetCustomerV2.js";
import { handleListCustomers } from "./handlers/handleListCustomers.js";
import { handlePostCustomer } from "./handlers/handlePostCustomerV2.js";
import { handleTransferProduct } from "./handlers/handleTransferProduct.js";
import { handleUpdateBalances } from "./handlers/handleUpdateBalances.js";
import { handleUpdateCustomer } from "./handlers/handleUpdateCustomer.js";
import { handleUpdateCustomerV2 } from "./handlers/handleUpdateCustomerV2.js";
import { handleUpdateEntitlement } from "./handlers/handleUpdateEntitlement.js";

export const expressCusRouter: Router = Router();

// expressCusRouter.post("", handlePostCustomerRequest);

// cusRouter.get("/:customer_id", handleGetCustomer);

expressCusRouter.delete("/:customer_id", handleDeleteCustomer);

// Update customer entitlement directly
expressCusRouter.post(
	"/:customer_id/entitlements/:customer_entitlement_id",
	handleUpdateEntitlement,
);

expressCusRouter.post("/:customer_id/balances", handleUpdateBalances);

expressCusRouter.get(
	"/:customer_id/billing_portal",
	async (req: any, res: any) => {
		try {
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
						code: ErrCode.StripeError,
						statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
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
			// if (org.api_version >= LegacyVersion.v1_1) {
			// } else {
			// 	res.status(200).json({
			// 		url: portal.url,
			// 	});
			// }
		} catch (error) {
			handleRequestError({ req, error, res, action: "get billing portal" });
		}
	},
);

expressCusRouter.post(
	"/:customer_id/billing_portal",
	handleCreateBillingPortal,
);

expressCusRouter.post("/:customer_id/coupons/:coupon_id", handleAddCouponToCus);

expressCusRouter.post("/:customer_id/transfer", handleTransferProduct);

export const cusRouter = new Hono<HonoEnv>();

cusRouter.get("", ...handleListCustomers);
cusRouter.get("/:customer_id", ...handleGetCustomerV2);
cusRouter.post("", ...handlePostCustomer);
cusRouter.post("/:customer_id", ...handleUpdateCustomerV2);
