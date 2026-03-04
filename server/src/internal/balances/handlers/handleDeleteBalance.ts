import {
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { fullCustomerToCustomerEntitlements } from "@autumn/shared";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

const DeleteBalanceParamsSchema = z.object({
	customer_id: z.string(),
	feature_id: z.string(),
	balance_id: z.string().optional(),
	entity_id: z.string().optional(),
});

export const handleDeleteBalance = createRoute({
	body: DeleteBalanceParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const { customer_id, feature_id, balance_id, entity_id } = params;

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			entityId: entity_id,
			withEntities: true,
		});

		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId: feature_id,
			entity: fullCustomer.entity,
			customerEntitlementFilters: balance_id
				? { externalId: balance_id }
				: undefined,
		});

		if (cusEnts.length === 0) {
			throw new RecaseError({
				message: `No balances found matching the provided filters`,
				code: ErrCode.NotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		// Mark as expired rather than deleting
		const now = Date.now();
		for (const cusEnt of cusEnts) {
			await CusEntService.update({
				ctx,
				id: cusEnt.id,
				updates: {
					expires_at: now,
				},
			});
		}

		await deleteCachedApiCustomer({
			ctx,
			customerId: customer_id,
			source: `handleDeleteBalance`,
		});

		return c.json({
			success: true,
			deleted_count: cusEnts.length,
		});
	},
});
