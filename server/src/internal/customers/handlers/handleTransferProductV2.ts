import {
	AffectedResource,
	AttachScenario,
	CusProductNotFoundError,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { CusService } from "../CusService.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { findTransferCustomerProduct } from "./handleTransferProduct/findTransferCustomerProduct.js";
import { handleDecreaseAndTransfer } from "./handleTransferProduct/handleDecreaseAndTransfer.js";

const TransferProductSchema = z.object({
	from_entity_id: z.string().nullish(),
	to_entity_id: z.string().nullish(),
	product_id: z.string(),
	customer_product_id: z.string().nullish(),
});

// Moves exactly one customer product; the target scope is never checked for conflicts.
// Supports:
// - Transfer from entity to entity
// - Transfer from entity to org
// - Transfer from org to entity
export const handleTransferProductV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	body: TransferProductSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id } = c.req.param();
		const { from_entity_id, to_entity_id, product_id, customer_product_id } =
			c.req.valid("json");

		if (!from_entity_id && !to_entity_id) {
			throw new RecaseError({
				message: "Must specify atleast one of: from_entity_id, to_entity_id",
			});
		}

		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
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

		const fromEntity =
			customer.entities.find(
				(entity) =>
					entity.id === from_entity_id || entity.internal_id === from_entity_id,
			) ?? null;

		const toEntity = to_entity_id
			? (customer.entities.find(
					(entity) =>
						entity.id === to_entity_id || entity.internal_id === to_entity_id,
				) ?? null)
			: null;

		if (to_entity_id && !toEntity) {
			throw new RecaseError({
				message: `Entity ${to_entity_id} not found`,
				statusCode: 404,
			});
		}

		const cusProduct = findTransferCustomerProduct({
			fullCustomer: customer,
			fromEntity,
			productId: product_id,
			customerProductId: customer_product_id,
		});

		if (!cusProduct) {
			throw new CusProductNotFoundError({
				customerId: customer_id,
				productId: product_id,
				entityId: from_entity_id || undefined,
			});
		}

		const licenseLinks =
			await planLicenseRepo.listCatalogByParentInternalProductIds({
				db,
				parentInternalProductIds: [cusProduct.internal_product_id],
			});
		const pools = await customerLicenseRepo.listByParentCustomerProductIds({
			db,
			parentCustomerProductIds: [cusProduct.id],
		});
		if (licenseLinks.length > 0 || pools.length > 0) {
			throw new RecaseError({
				message: `Product ${product_id} has license pools for this customer and cannot be transferred.`,
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
			const updates = {
				entity_id: toEntity?.id ?? null,
				internal_entity_id: toEntity?.internal_id ?? null,
			};
			await CusProductService.update({
				ctx,
				cusProductId: cusProduct.id,
				updates,
			});

			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: customer.internal_id,
				org: ctx.org,
				env: ctx.env,
				customerId: customer.id || customer.internal_id,
				scenario: AttachScenario.New,
				cusProduct: {
					...cusProduct,
					...updates,
				},
			});
		}

		return c.json({
			success: true,
		});
	},
});
