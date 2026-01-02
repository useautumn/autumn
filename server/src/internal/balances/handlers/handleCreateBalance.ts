import {
	CreateBalanceSchema
} from "@autumn/shared";
import { FeatureNotFoundError } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { prepareNewBalanceForInsertion } from "../createBalance/prepareNewBalanceForInsertion";
import {
	validateCreateBalanceParams
} from "../createBalance/validateCreateBalance";

export const handleCreateBalance = createRoute({
	body: CreateBalanceSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { feature_id, customer_id, granted_balance, unlimited, reset } =
			c.req.valid("json");

		const feature = ctx.features.find((f) => f.id === feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: feature_id });
		}
		34;
		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await validateCreateBalanceParams({
			ctx,
			feature,
			internalCustomerId: fullCustomer.internal_id,
			granted_balance,
			unlimited,
			reset,
			fullCustomer,
		});

		const { newEntitlement, newCustomerEntitlement } =
			await prepareNewBalanceForInsertion({
				ctx,
				feature,
				granted_balance,
				unlimited,
				reset,
				fullCus: fullCustomer,
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

		await deleteCachedApiCustomer({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: customer_id,
			source: "handleCreateBalance",
		});

		return c.json({ success: true });
	},
});
