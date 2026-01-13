import { CreateBalanceParamsSchema } from "@autumn/shared";
import { FeatureNotFoundError } from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { prepareNewBalanceForInsertion } from "@/internal/balances/createBalance/prepareNewBalanceForInsertion";
import { validateCreateBalanceParams } from "@/internal/balances/createBalance/validateCreateBalance";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";

export const handleCreateBalance = createRoute({
	body: CreateBalanceParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env } = ctx;

		const createBalanceParams = c.req.valid("json");
		const { feature_id, customer_id, entity_id } = createBalanceParams;

		const feature = ctx.features.find((f) => f.id === feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: feature_id });
		}

		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env: env,
			entityId: entity_id,
			withEntities: true,
		});

		await validateCreateBalanceParams({
			ctx,
			feature,
			params: createBalanceParams,
			fullCustomer,
		});

		const { newEntitlement, newCustomerEntitlement } =
			await prepareNewBalanceForInsertion({
				ctx,
				feature,
				fullCustomer,
				params: createBalanceParams,
			});

		await ctx.db.transaction(async (tx) => {
			await EntitlementService.insert({
				db: tx as unknown as DrizzleCli,
				data: [newEntitlement],
			});

			await CusEntService.insert({
				db: tx as unknown as DrizzleCli,
				data: [newCustomerEntitlement],
			});
		});

		return c.json({ success: true });
	},
});
