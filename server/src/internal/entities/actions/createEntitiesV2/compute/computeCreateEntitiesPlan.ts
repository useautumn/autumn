import type { AutumnBillingPlan, EntityClaim } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";
import { computeEntityBalancesPlan } from "./computeEntityBalancesPlan.js";
import { computeEntityDefaultsPlan } from "./computeEntityDefaultsPlan.js";

const claimEntityToPlan = ({
	existing,
	claimed,
}: NonNullable<CreateEntitiesContext["claimedEntity"]>): EntityClaim => ({
	entity: existing,
	updates: {
		id: claimed.id,
		name: claimed.name,
		spend_limits: claimed.spend_limits,
		usage_limits: claimed.usage_limits,
		usage_alerts: claimed.usage_alerts,
		overage_allowed: claimed.overage_allowed,
	},
});

export const computeCreateEntitiesPlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateEntitiesContext;
}): AutumnBillingPlan => {
	const {
		fullCustomer,
		customerEntitlements,
		insertedEntities,
		claimedEntity,
		entitiesByFeature,
	} = context;

	const { insertCustomerProducts, pooledBalancePlan } =
		computeEntityDefaultsPlan({
			ctx,
			context,
		});

	return {
		customerId: fullCustomer.id ?? "",
		insertEntities: insertedEntities,
		claimEntities: claimedEntity ? [claimEntityToPlan(claimedEntity)] : [],
		insertCustomerProducts,
		pooledBalancePlan,
		updateCustomerEntitlements: entitiesByFeature.flatMap((group) =>
			computeEntityBalancesPlan({
				customerEntitlements,
				entitiesByFeature: group,
			}),
		),
	};
};
