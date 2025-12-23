import {
	CusProductNotFoundError,
	cusProductToProcessorType,
	ErrCode,
	type FullCusProduct,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { Router } from "express";
import { CusService } from "@/internal/customers/CusService.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { RELEVANT_STATUSES } from "../cusProducts/CusProductService.js";
import { handleCancelProduct } from "./handleCancelProduct.js";

const cancelRouter: Router = Router();

cancelRouter.post("", async (req, res) =>
	routeHandler({
		req,
		res,
		action: "expire",
		handler: async (req, res) => {
			const { db, org, env } = req;
			const {
				customer_id,
				product_id,
				entity_id,
				cancel_immediately,
				prorate: bodyProrate,
				customer_product_id,
			} = req.body;

			const expireImmediately = cancel_immediately || false;
			const prorate = notNullish(bodyProrate) ? bodyProrate : true;

			const fullCus = await CusService.getFull({
				db,
				orgId: org.id,
				idOrInternalId: customer_id,
				env,
				withEntities: true,
				entityId: entity_id,
				inStatuses: RELEVANT_STATUSES,
				allowNotFound: false,
			});

			if (entity_id && !fullCus.entity) {
				throw new RecaseError({
					code: ErrCode.EntityNotFound,
					message: `Entity ${entity_id} not found for customer ${customer_id}`,
				});
			}

			const cusProducts = fullCus.customer_products;
			const entity = fullCus.entity;

			const cusProduct = cusProducts.find((cusProduct: FullCusProduct) => {
				const productIdMatch = cusProduct.product.id === product_id;
				const entityMatch = entity
					? cusProduct.internal_entity_id === entity.internal_id
					: nullish(cusProduct.internal_entity_id);

				const cusProductIdMatch = customer_product_id
					? cusProduct.id === customer_product_id
					: true;

				return productIdMatch && entityMatch && cusProductIdMatch;
			});

			if (!cusProduct) {
				throw new CusProductNotFoundError({
					customerId: customer_id,
					productId: product_id,
					entityId: entity_id,
				});
			}

			if (cusProductToProcessorType(cusProduct) === ProcessorType.RevenueCat) {
				throw new RecaseError({
					message: `Cannot cancel '${cusProduct.product.name}' because it is managed by RevenueCat.`,
				});
			}

			await handleCancelProduct({
				ctx: req as unknown as AutumnContext,
				cusProduct,
				fullCus,
				expireImmediately,
				prorate,
			});

			res.status(200).json({
				success: true,
				customer_id: customer_id,
				product_id: product_id,
			});
		},
	}),
);

export default cancelRouter;
