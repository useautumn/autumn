import {
	CusProductNotFoundError,
	cusProductToProcessorType,
	EntityNotFoundError,
	type FullCusProduct,
	notNullish,
	nullish,
	ProcessorType,
	RELEVANT_STATUSES,
	RecaseError,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { handleCancelProduct } from "@/internal/customers/cancel/handleCancelProduct.js";
import { CusService } from "../CusService.js";

export const handleCancel = createRoute({
	// body: CancelBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const {
			customer_id,
			product_id,
			entity_id,
			cancel_immediately,
			prorate: bodyProrate,
			customer_product_id,
		} = await c.req.json();

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
			throw new EntityNotFoundError({ entityId: entity_id });
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
			ctx,
			cusProduct,
			fullCus,
			expireImmediately,
			prorate,
		});

		return c.json({
			success: true,
			customer_id: customer_id,
			product_id: product_id,
		});
	},
});
