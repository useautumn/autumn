import { CusExpand, ErrCode, LegacyVersion } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { routeHandler } from "@/utils/routerUtils.js";
import { orgToVersion } from "@/utils/versionUtils/legacyVersionUtils.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";
import { parseCusExpand } from "../cusUtils/cusUtils.js";
import { getCustomerDetails } from "../cusUtils/getCustomerDetails.js";

export const handleGetCustomer = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get customer",
		handler: async () => {
			const customerId = req.params.customer_id;
			const { env, db, logtail: logger, org, features } = req;
			const { expand } = req.query;

			const expandArray = parseCusExpand(expand);

			const apiVersion = orgToVersion({
				org,
				reqApiVersion: req.apiVersion,
			});

			const getInvoices = apiVersion < LegacyVersion.v1_1;
			if (getInvoices) expandArray.push(CusExpand.Invoices);

			logger.info(`getting customer ${customerId} for org ${org.slug}`);
			const startTime = Date.now();
			const customer = await getCusWithCache({
				db,
				idOrInternalId: customerId,
				org,
				env,
				expand: expandArray,
				allowNotFound: true,
				logger,
			});

			logger.info(`get customer took ${Date.now() - startTime}ms`);

			if (!customer) {
				req.logtail.warn(
					`GET /customers/${customerId}: not found | Org: ${org.slug}`,
				);
				res.status(StatusCodes.NOT_FOUND).json({
					message: `Customer ${customerId} not found`,
					code: ErrCode.CustomerNotFound,
				});
				return;
			}

			const cusData = await getCustomerDetails({
				db,
				customer,
				org,
				env: req.env,
				logger: req.logtail,
				cusProducts: customer.customer_products,
				expand: expandArray,
				features,
				apiVersion: req.apiVersion,
			});

			res.status(200).json(cusData);
		},
	});
