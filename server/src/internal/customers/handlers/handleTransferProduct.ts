import { AttachScenario, ErrCode } from "@autumn/shared";
import {
	CusProductAlreadyExistsError,
	CusProductNotFoundError,
} from "@shared/api/errors/classes/cusProductErrClasses.js";
import { z } from "zod";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusService } from "../CusService.js";
import { deleteCusCache } from "../cusCache/updateCachedCus.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { handleDecreaseAndTransfer } from "./handleTransferProduct/handleDecreaseAndTransfer.js";

const TransferProductSchema = z.object({
	from_entity_id: z.string().nullish(),
	to_entity_id: z.string(),
	product_id: z.string(),
});

export const handleTransferProduct = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "transfer product",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			const { customer_id } = req.params;
			const { from_entity_id, to_entity_id, product_id } =
				TransferProductSchema.parse(req.body);

			const customer = await CusService.getFull({
				idOrInternalId: customer_id,
				orgId: req.orgId,
				env: req.env,
				db: req.db,
				withEntities: true,
				// entityId: from_entity_id,
			});

			const product = await ProductService.get({
				id: product_id,
				orgId: req.orgId,
				env: req.env,
				db: req.db,
			});

			if (!product) {
				throw new CusProductNotFoundError({
					customerId: customer_id,
					productId: product_id,
				});
			}

			const fromEntity = customer.entities.find(
				(e: any) => e.id === from_entity_id,
			);

			const toEntity = customer.entities.find(
				(e: any) => e.id === to_entity_id,
			);

			// if (!fromEntity) {
			//   throw new RecaseError({
			//     code: ErrCode.EntityNotFound,
			//     message: `Entity ${from_entity_id} not found`,
			//     statusCode: 404,
			//   });
			// }

			if (!toEntity) {
				throw new RecaseError({
					code: ErrCode.EntityNotFound,
					message: `Entity ${to_entity_id} not found`,
					statusCode: 404,
				});
			}

			const cusProduct = customer.customer_products.find(
				(cp: any) =>
					(fromEntity
						? cp.internal_entity_id === fromEntity.internal_id
						: nullish(cp.internal_entity_id)) && cp.product.id === product_id,
			);

			const toCusProduct = customer.customer_products.find(
				(cp: any) =>
					cp.internal_entity_id === toEntity.internal_id &&
					cp.product.group === product.group,
			);

			if (toCusProduct) {
				throw new CusProductAlreadyExistsError({
					productId: product_id,
					entityId: toEntity.id,
				});
			}

			if (!cusProduct) {
				throw new CusProductNotFoundError({
					customerId: customer_id,
					productId: product_id,
					entityId: from_entity_id || undefined,
				});
			}

			// 1. If cus product has quantity > 1, only transfer 1...
			if (cusProduct.quantity > 1) {
				await handleDecreaseAndTransfer({
					req: req,
					fullCus: customer,
					cusProduct: cusProduct,
					toEntity: toEntity,
				});
			} else {
				await CusProductService.update({
					db: req.db,
					cusProductId: cusProduct.id,
					updates: {
						entity_id: toEntity.id,
						internal_entity_id: toEntity.internal_id,
					},
				});

				await addProductsUpdatedWebhookTask({
					req,
					internalCustomerId: customer.internal_id,
					org: req.org,
					env: req.env,
					customerId: customer.id || customer.internal_id,
					scenario: AttachScenario.New,
					cusProduct: {
						...cusProduct,
						entity_id: toEntity.id,
						internal_entity_id: toEntity.internal_id,
					},
					logger: req.logger,
				});
			}

			await deleteCusCache({
				db: req.db,
				customerId: customer.id || customer.internal_id,
				org: req.org,
				env: req.env,
			});

			res.status(200).json({
				// message: "Product transferred successfully",
				success: true,
			});
		},
	});
