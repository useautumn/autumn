import { ErrCode, LegacyVersion } from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusSearchService } from "@/internal/customers/CusSearchService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { handleBatchCustomers } from "../api/batch/handlers/handleBatchCustomers.js";
import { entityRouter } from "../api/entities/entityRouter.js";
import { toSuccessUrl } from "../orgs/orgUtils/convertOrgUtils.js";
import { CusService } from "./CusService.js";
import { handleAddCouponToCus } from "./handlers/handleAddCouponToCus.js";
import { handleCreateBillingPortal } from "./handlers/handleCreateBillingPortal.js";
import { handleDeleteCustomer } from "./handlers/handleDeleteCustomer.js";
import { handleGetCustomer } from "./handlers/handleGetCustomer.js";
import { handlePostCustomerRequest } from "./handlers/handlePostCustomer.js";
import { handleTransferProduct } from "./handlers/handleTransferProduct.js";
import { handleUpdateBalances } from "./handlers/handleUpdateBalances.js";
import { handleUpdateCustomer } from "./handlers/handleUpdateCustomer.js";
import { handleUpdateEntitlement } from "./handlers/handleUpdateEntitlement.js";

export const cusRouter: Router = Router();

cusRouter.get("", handleBatchCustomers);

cusRouter.post("/all/search", async (req: any, res: any) => {
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

cusRouter.post("", handlePostCustomerRequest);

cusRouter.get("/:customer_id", handleGetCustomer);

cusRouter.delete("/:customer_id", handleDeleteCustomer);

cusRouter.post("/:customer_id", handleUpdateCustomer);

// Update customer entitlement directly
cusRouter.post(
	"/:customer_id/entitlements/:customer_entitlement_id",
	handleUpdateEntitlement,
);

cusRouter.post("/:customer_id/balances", handleUpdateBalances);

// cusRouter.post(
//   "/customer_products/:customer_product_id",
//   handleCusProductExpired
// );

cusRouter.get("/:customer_id/billing_portal", async (req: any, res: any) => {
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

		if (!customer.processor?.id) {
			let newCus;
			try {
				newCus = await createStripeCusIfNotExists({
					db: req.db,
					org,
					env: req.env,
					customer,
					logger: req.logtail,
				});
			} catch (error: any) {
				throw new RecaseError({
					message: `Failed to create Stripe customer`,
					code: ErrCode.StripeError,
					statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				});
			} finally {
				if (!newCus) {
					throw new RecaseError({
						message: `Failed to create Stripe customer`,
						code: ErrCode.StripeError,
						statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
					});
				}

				const portal = await stripeCli.billingPortal.sessions.create({
					customer: newCus.id,
					return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
				});

				if (org.api_version >= LegacyVersion.v1_1) {
					return res.status(200).json({
						customer_id: customer.id,
						url: portal.url,
					});
				} else {
					return res.status(200).json({
						url: portal.url,
					});
				}
			}
		}

		const portal = await stripeCli.billingPortal.sessions.create({
			customer: customer.processor.id,
			return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
		});

		if (org.api_version >= LegacyVersion.v1_1) {
			res.status(200).json({
				customer_id: customer.id,
				url: portal.url,
			});
		} else {
			res.status(200).json({
				url: portal.url,
			});
		}
	} catch (error) {
		handleRequestError({ req, error, res, action: "get billing portal" });
	}
});

cusRouter.post("/:customer_id/billing_portal", handleCreateBillingPortal);

cusRouter.post("/:customer_id/coupons/:coupon_id", handleAddCouponToCus);

cusRouter.use("/:customer_id/entities", entityRouter);

cusRouter.post("/:customer_id/transfer", handleTransferProduct);
