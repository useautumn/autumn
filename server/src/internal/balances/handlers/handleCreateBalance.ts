import { CreateBalanceParamsV0Schema, fullSubjectToFullCustomer, Scopes } from "@autumn/shared";
import { FeatureNotFoundError } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { prepareNewBalanceForInsertion } from "@/internal/balances/createBalance/prepareNewBalanceForInsertion";
import { validateCreateBalanceParams } from "@/internal/balances/createBalance/validateCreateBalance";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

export const handleCreateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
	body: CreateBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const createBalanceParams = c.req.valid("json");
		const { feature_id, customer_id, entity_id } = createBalanceParams;

		const feature = ctx.features.find((f) => f.id === feature_id);
		if (!feature) throw new FeatureNotFoundError({ featureId: feature_id });

		const fullCustomer = isFullSubjectRolloutEnabled({ ctx })
			? fullSubjectToFullCustomer({
					fullSubject: await getOrSetCachedFullSubject({
						ctx,
						customerId: customer_id,
						entityId: entity_id,
						source: "handleCreateBalance",
					}),
				})
			: await CusService.getFull({
					ctx,
					idOrInternalId: customer_id,
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

		await EntitlementService.insert({
			db: ctx.db,
			data: [newEntitlement],
		});

		await CusEntService.insert({
			ctx,
			data: [newCustomerEntitlement],
		});

		return c.json({ success: true });
	},
});
