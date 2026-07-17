import {
	cusEntsToUsage,
	cusEntToRecalculateScopeKey,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getRecalculableScopeKeys,
	type RecalculateBalanceParamsV0,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters";
import {
	getCustomerEntitlementGrantState,
	reapplyUsageToCustomerEntitlements,
} from "./reapplyUsageToCustomerEntitlements.js";

/**
 * Computes (without persisting) the result of recalculating a customer's
 * balances for a feature: every matching entitlement is reset to its starting
 * balance and the total usage is re-applied across them in priority order
 * (allowing overage). Returns the original entitlements (`before`) and the
 * recalculated clones (`after`) so callers can persist them or preview the diff.
 */
export const computeRecalculateBalance = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: RecalculateBalanceParamsV0;
}): Promise<{
	fullCustomer: FullCustomer;
	entityId: string | undefined;
	before: FullCusEntWithFullCusProduct[];
	after: FullCusEntWithFullCusProduct[];
	totalUsage: number;
}> => {
	const { customer_id, entity_id, feature_id } = params;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer_id,
		entityId: entity_id,
		withEntities: true,
		withSubs: true,
	});
	const before = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature_id,
		entity: fullCustomer.entity,
		customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	});
	if (before.length === 0) {
		throw new RecaseError({
			message: `Balance not found for feature ${feature_id} and customer ${customer_id}`,
			statusCode: 404,
		});
	}
	const entityId = fullCustomer.entity?.id ?? undefined;
	const totalUsage = cusEntsToUsage({ cusEnts: before, entityId });
	const after = before.map((cusEnt) => structuredClone(cusEnt));
	const recalculableScopes = getRecalculableScopeKeys({
		cusEnts: after,
		entityId,
	});
	const scopeGroups = new Map<string, FullCusEntWithFullCusProduct[]>();
	for (const cusEnt of after) {
		const key = cusEntToRecalculateScopeKey({ cusEnt });
		const group = scopeGroups.get(key);
		if (group) {
			group.push(cusEnt);
		} else {
			scopeGroups.set(key, [cusEnt]);
		}
	}
	for (const [key, group] of scopeGroups) {
		if (!recalculableScopes.has(key)) {
			continue;
		}
		const scopeUsage = cusEntsToUsage({ cusEnts: group, entityId });
		reapplyUsageToCustomerEntitlements({
			customerEntitlements: group,
			usage: scopeUsage,
			targetEntityId: entityId,
			getGrantState: getCustomerEntitlementGrantState,
		});
	}
	return { fullCustomer, entityId, before, after, totalUsage };
};
