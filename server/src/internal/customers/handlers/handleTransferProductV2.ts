import {
	AffectedResource,
	AttachScenario,
	CusProductAlreadyExistsError,
	CusProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "../../../utils/models/Request.js";
import { CusService } from "../CusService.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { handleDecreaseAndTransfer } from "./handleTransferProduct/handleDecreaseAndTransfer.js";

const TransferProductSchema = z.object({
	from_entity_id: z.string().nullish(),
	to_entity_id: z.string(),
	product_id: z.string(),
});

export const handleTransferProductV2 = createRoute({
	body: TransferProductSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id } = c.req.param();
		const { from_entity_id, to_entity_id, product_id } = c.req.valid("json");

		const customer = await CusService.getFull({
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
			db,
			withEntities: true,
		});

		const product = await ProductService.get({
			id: product_id,
			orgId: org.id,
			env,
			db,
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

		const toEntity = customer.entities.find((e: any) => e.id === to_entity_id);

		if (!toEntity) {
			throw new RecaseError({
				message: `Entity ${to_entity_id} not found`,
			});
		}

		const cusProduct = customer.customer_products.find(
			(cp: any) =>
				(fromEntity
					? cp.internal_entity_id === fromEntity.internal_id
					: nullish(cp.internal_entity_id)) && cp.product.id === product_id,
		);

		const toCusProduct = customer.customer_products.find((cp: any) => {
			const productMatch = cusProduct?.product.is_add_on
				? cp.product.product_id === product.id
				: cp.product.group === product.group;
			return cp.internal_entity_id === toEntity.internal_id && productMatch;
		});

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
				ctx,
				fullCus: customer,
				cusProduct: cusProduct,
				toEntity: toEntity,
			});
		} else {
			await CusProductService.update({
				db,
				cusProductId: cusProduct.id,
				updates: {
					entity_id: toEntity.id,
					internal_entity_id: toEntity.internal_id,
				},
			});

			await addProductsUpdatedWebhookTask({
				req: ctx as ExtendedRequest,
				internalCustomerId: customer.internal_id,
				org: ctx.org,
				env: ctx.env,
				customerId: customer.id || customer.internal_id,
				scenario: AttachScenario.New,
				cusProduct: {
					...cusProduct,
					entity_id: toEntity.id,
					internal_entity_id: toEntity.internal_id,
				},
				logger: ctx.logger,
			});
		}

		return c.json({
			success: true,
		});
	},
});
