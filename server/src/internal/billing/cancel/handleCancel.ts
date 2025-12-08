import {
	CancelParamsSchema,
	CusProductNotFoundError,
	ErrCode,
	type FullCusProduct,
	nullish,
	RELEVANT_STATUSES,
	RecaseError,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { CusService } from "../../customers/CusService";
import { handleCancelProduct } from "../../customers/cancel/handleCancelProduct";

export const handleCancel = createRoute({
	body: CancelParamsSchema,
	// resource: AffectedResource.Cancel,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const {
			customer_id,
			product_id,
			entity_id,
			cancel_immediately,
			prorate,
			filters,
		} = body;

		const { db, org, env } = ctx;

		const expireImmediately = cancel_immediately || false;

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
			const productMatch = cusProduct.product.id === product_id;
			const entityMatch = entity
				? cusProduct.internal_entity_id === entity.internal_id
				: nullish(cusProduct.internal_entity_id);

			const cusProductIdMatch = filters?.customer_product_id
				? cusProduct.id === filters?.customer_product_id
				: true;
			return productMatch && entityMatch && cusProductIdMatch;
		});

		if (!cusProduct) {
			throw new CusProductNotFoundError({
				customerId: customer_id,
				productId: product_id,
				entityId: entity_id,
			});
		}

		await handleCancelProduct({
			ctx,
			cusProduct,
			fullCus,
			expireImmediately,
			prorate: prorate,
		});

		return c.json({
			success: true,
			customer_id: customer_id,
			product_id: product_id,
		});
	},
});
