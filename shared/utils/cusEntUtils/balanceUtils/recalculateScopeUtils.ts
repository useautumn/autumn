import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { cusEntsToBalance } from "./cusEntsToBalance";

export const RECALCULATE_CUSTOMER_SCOPE = "__customer__";

type RecalculateScopeCustomerEntitlement = FullCustomerEntitlementView & {
	customer_product: { internal_entity_id?: string | null } | null;
};

export const cusEntToRecalculateScopeKey = ({
	cusEnt,
}: {
	cusEnt: RecalculateScopeCustomerEntitlement;
}): string =>
	cusEnt.internal_entity_id ??
	cusEnt.customer_product?.internal_entity_id ??
	RECALCULATE_CUSTOMER_SCOPE;

export const getRecalculableScopeKeys = ({
	cusEnts,
	entityId,
}: {
	cusEnts: RecalculateScopeCustomerEntitlement[];
	entityId?: string;
}): Set<string> => {
	const scopes = new Map<
		string,
		{ hasNegative: boolean; hasPositive: boolean }
	>();
	for (const cusEnt of cusEnts) {
		const key = cusEntToRecalculateScopeKey({ cusEnt });
		const scope = scopes.get(key) ?? {
			hasNegative: false,
			hasPositive: false,
		};
		const remaining = cusEntsToBalance({ cusEnts: [cusEnt], entityId });
		if (remaining < 0) scope.hasNegative = true;
		if (remaining > 0) scope.hasPositive = true;
		scopes.set(key, scope);
	}
	const recalculable = new Set<string>();
	for (const [key, scope] of scopes) {
		if (scope.hasNegative && scope.hasPositive) {
			recalculable.add(key);
		}
	}
	return recalculable;
};

export const hasRecalculableScope = ({
	cusEnts,
	entityId,
}: {
	cusEnts: RecalculateScopeCustomerEntitlement[];
	entityId?: string;
}): boolean => getRecalculableScopeKeys({ cusEnts, entityId }).size > 0;
