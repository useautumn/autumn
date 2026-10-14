import {
	CreateBalanceParamsV0Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { FeatureNotFoundError } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { prepareNewBalanceForInsertion } from "@/internal/balances/createBalance/prepareNewBalanceForInsertion";
import { validateCreateBalanceParams } from "@/internal/balances/createBalance/validateCreateBalance";
import { getSubjectFullCustomer } from "@/internal/balances/utils/getSubjectFullCustomer.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";

export const handleCreateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: CreateBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const createBalanceParams = c.req.valid("json");
		const { feature_id, customer_id, entity_id } = createBalanceParams;

		const feature = ctx.features.find((f) => f.id === feature_id);
		if (!feature) throw new FeatureNotFoundError({ featureId: feature_id });

		const fullCustomer = await getSubjectFullCustomer({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
			source: "handleCreateBalance",
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

		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: customer_id,
				existingEntities: fullCustomer.entity ? [fullCustomer.entity] : [],
				insertCustomerProducts: [],
				customEntitlements: [newEntitlement],
				insertCustomerEntitlements: [
					{
						...newCustomerEntitlement,
						balance: newCustomerEntitlement.balance ?? 0,
					},
				],
			},
		});

		return c.json({ success: true });
	},
});
