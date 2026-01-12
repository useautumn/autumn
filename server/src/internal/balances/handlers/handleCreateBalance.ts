import { CreateBalanceSchema, EntityNotFoundError } from "@autumn/shared";
import { FeatureNotFoundError } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { prepareNewBalanceForInsertion } from "../createBalance/prepareNewBalanceForInsertion";
import { validateCreateBalanceParams } from "../createBalance/validateCreateBalance";

export const handleCreateBalance = createRoute({
	body: CreateBalanceSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;
		const {
			feature_id,
			customer_id,
			entity_id,
			granted_balance,
			unlimited,
			reset,
			expires_at,
		} = c.req.valid("json");

		const feature = ctx.features.find((f) => f.id === feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: feature_id });
		}

		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env: env,
			withEntities: true,
		});

		if (entity_id && !fullCustomer.entities.find((e) => e.id === entity_id)) {
			throw new EntityNotFoundError({
				entityId: entity_id,
			});
		}

		await validateCreateBalanceParams({
			ctx,
			feature,
			internalCustomerId: fullCustomer.internal_id,
			granted_balance,
			unlimited,
			reset,
			expires_at,
			fullCustomer,
			entity_id,
		});

		const { newEntitlement, newCustomerEntitlement } =
			await prepareNewBalanceForInsertion({
				ctx,
				feature,
				granted_balance,
				unlimited,
				reset,
				expires_at,
				fullCus: fullCustomer,
				entity: entity_id
					? fullCustomer.entities.find((e) => e.id === entity_id)
					: undefined,
				feature_id,
			});

		await EntitlementService.insert({
			db: ctx.db,
			data: [newEntitlement],
		});

		await CusEntService.insert({
			db: ctx.db,
			data: [newCustomerEntitlement],
		});

		await deleteCachedFullCustomer({
			customerId: customer_id,
			ctx,
			source: "handleCreateBalance",
		});

		return c.json({ success: true });
	},
});
