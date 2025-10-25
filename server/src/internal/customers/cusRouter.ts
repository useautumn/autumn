import { ErrCode } from "@autumn/shared";
import { Router } from "express";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { CusSearchService } from "@/internal/customers/CusSearchService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { handleBatchCustomers } from "../api/batch/handlers/handleBatchCustomers.js";
import { expressEntityRouter } from "../api/entities/entityRouter.js";
import { toSuccessUrl } from "../orgs/orgUtils/convertOrgUtils.js";
import { CusService } from "./CusService.js";
import { handleAddCouponToCus } from "./handlers/handleAddCouponToCus.js";
import { handleCreateBillingPortal } from "./handlers/handleCreateBillingPortal.js";
import { handleDeleteCustomer } from "./handlers/handleDeleteCustomer.js";
import { handleGetCustomerV2 } from "./handlers/handleGetCustomerV2.js";
import { handlePostCustomer } from "./handlers/handlePostCustomerV2.js";
import { handleTransferProduct } from "./handlers/handleTransferProduct.js";
import { handleUpdateBalances } from "./handlers/handleUpdateBalances.js";
import { handleUpdateCustomer } from "./handlers/handleUpdateCustomer.js";
import { handleUpdateEntitlement } from "./handlers/handleUpdateEntitlement.js";

export const expressCusRouter: Router = Router();

expressCusRouter.get("", handleBatchCustomers);

expressCusRouter.post("/all/search", async (req: any, res: any) => {
	try {
		const { search, page_size = 50, page = 1, last_item, filters } = req.body;

		const { data: customers, count } = await CusSearchService.search({
			db: req.db,
			orgId: req.orgId,
			env: req.env,
			search,
			filters,
			lastItem: last_item,
			pageNumber: page,
			pageSize: page_size,
		});

		res.status(200).json({ customers, totalCount: Number(count) });
	} catch (error) {
		handleRequestError({ req, error, res, action: "search customers" });
	}
});

// expressCusRouter.post("", handlePostCustomerRequest);

// cusRouter.get("/:customer_id", handleGetCustomer);

expressCusRouter.delete("/:customer_id", handleDeleteCustomer);

expressCusRouter.post("/:customer_id", handleUpdateCustomer);

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

expressCusRouter.use("/:customer_id/entities", expressEntityRouter);

expressCusRouter.post("/:customer_id/transfer", handleTransferProduct);

export const cusRouter = new Hono<HonoEnv>();

cusRouter.get("/:customer_id", ...handleGetCustomerV2);
cusRouter.post("", ...handlePostCustomer);
