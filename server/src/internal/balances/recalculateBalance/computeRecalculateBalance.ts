import {
	cusEntsToUsage,
	cusEntToRecalculateScopeKey,
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getRecalculableScopeKeys,
	type RecalculateBalanceParamsV0,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";
import { CusService } from "@/internal/customers/CusService";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters";

const resetCusEntInPlace = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): void => {
	const resetUpdate = getResetBalancesUpdate({
		cusEnt,
		allowance: cusEntToStartingBalance({ cusEnt }) ?? undefined,
	});
	if ("entities" in resetUpdate) {
		cusEnt.entities = resetUpdate.entities;
	} else {
		cusEnt.balance = resetUpdate.balance;
		cusEnt.additional_balance = resetUpdate.additional_balance;
	}
	cusEnt.adjustment = 0;
};

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
		for (const cusEnt of group) {
			resetCusEntInPlace({ cusEnt });
		}
		deductFromCusEntsTypescript({
			cusEnts: group,
			amountToDeduct: scopeUsage,
			targetEntityId: entityId,
			allowOverage: true,
		});
	}
	return { fullCustomer, entityId, before, after, totalUsage };
};
