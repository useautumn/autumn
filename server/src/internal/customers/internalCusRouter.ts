import {
	CusExpand,
	CusProductStatus,
	cusProductToProduct,
	ErrCode,
	productToCusProduct,
} from "@autumn/shared";
import { Router } from "express";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { EventService } from "../api/events/EventService.js";
import { ProductService } from "../products/ProductService.js";
import { mapToProductV2 } from "../products/productV2Utils.js";
import { CusBatchService } from "./CusBatchService.js";
import { CusSearchService } from "./CusSearchService.js";
import { CusService } from "./CusService.js";
import { ACTIVE_STATUSES } from "./cusProducts/CusProductService.js";
import { handleGetCusReferrals } from "./internalHandlers/handleGetCusReferrals.js";

export const cusRouter: Router = Router();

cusRouter.post("/all/search", (req, res) =>
	routeHandler({
		req,
		res,
		action: "search customers",
		handler: async (req, res) => {
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
		},
	}),
);

cusRouter.get("/:customer_id/events", async (req: any, res: any) => {
	try {
		const { db, org, features, env } = req;
		const { customer_id } = req.params;
		const orgId = req.orgId;

		const customer = await CusService.get({
			db,
			orgId,
			env,
			idOrInternalId: customer_id,
		});

		if (!customer) {
			throw new RecaseError({
				message: "Customer not found",
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const events = await EventService.getByCustomerId({
			db,
			internalCustomerId: customer.internal_id,
			env,
			orgId: orgId,
		});

		res.status(200).json({ events });
	} catch (error) {
		handleFrontendReqError({ req, error, res, action: "get customer events" });
	}
});

cusRouter.post("/all/full_customers", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get customer full customers",
		handler: async (req, res) => {
			const { db, org, env } = req;
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

			const fullCustomers = await CusBatchService.getByInternalIds({
				db,
				org,
				env,
				internalCustomerIds: customers.map(
					(customer: any) => customer.internal_id,
				),
			});

			res.status(200).json({ fullCustomers });
		},
	}),
);

cusRouter.get(
	"/:customer_id/product/:product_id",
	async (req: any, res: any) => {
		try {
			const { org, env, db, features, logger } = req;
			const { customer_id, product_id } = req.params;
			const { version, customer_product_id, entity_id } = req.query;

			const customer = await CusService.getFull({
				db,
				orgId: org.id,
				env,
				idOrInternalId: customer_id,
				withEntities: true,
				entityId: entity_id,
				inStatuses: [
					CusProductStatus.Active,
					CusProductStatus.PastDue,
					CusProductStatus.Scheduled,
					CusProductStatus.Expired,
				],
			});

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					code: "CUSTOMER_NOT_FOUND",
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			const cusProducts = customer.customer_products;
			const entity = customer.entity;

			const cusProduct = productToCusProduct({
				cusProducts,
				productId: product_id,
				internalEntityId: entity?.internal_id,
				version: version ? parseInt(version) : undefined,
				cusProductId: customer_product_id,
				inStatuses: ACTIVE_STATUSES,
			});

			const product = cusProduct
				? cusProductToProduct({ cusProduct })
				: await ProductService.getFull({
					db,
					orgId: org.id,
					env,
					idOrInternalId: product_id,
					version:
						version && Number.isInteger(parseInt(version))
							? parseInt(version)
							: undefined,
				});

			const productV2 = mapToProductV2({ product: product!, features });

			res.status(200).json({
				cusProduct,
				product: productV2,
			});
		} catch (error) {
			handleFrontendReqError({
				req,
				error,
				res,
				action: "get customer product",
			});
		}
	},
);

export const internalCusRouter = new Hono<HonoEnv>();

export const handleGetCustomerInternal = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { customer_id } = c.req.param();

		const fullCus = await CusService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customer_id,
			withEntities: true,
			withExtraCustomerEntitlements: true,
			expand: [CusExpand.Invoices],
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
				CusProductStatus.Expired,
			],
		});

		return c.json({
			customer: fullCus,
		});
	},
});

internalCusRouter.get("/:customer_id", ...handleGetCustomerInternal);
internalCusRouter.get("/:customer_id/referrals", ...handleGetCusReferrals);
