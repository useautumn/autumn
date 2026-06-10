import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToBalance } from "./cusEntsToBalance";

export const RECALCULATE_CUSTOMER_SCOPE = "__customer__";

/**
 * Balances are only ever recalculated against siblings with the same scope: a
 * balance owned by an entity stays within that entity, and customer-level
 * balances stay at the customer level.
 */
export const cusEntToRecalculateScopeKey = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): string =>
	cusEnt.internal_entity_id ??
	cusEnt.customer_product?.internal_entity_id ??
	RECALCULATE_CUSTOMER_SCOPE;

/**
 * Returns the scope keys that can be recalculated - i.e. scopes that contain
 * both an overdrawn balance and a balance with remaining to absorb it. Uses the
 * main balance (not rollovers) because recalculation redistributes the main
 * balance, so this matches exactly what a recalculation would change. Shared by
 * the dashboard (to decide whether to offer the action) and the backend (to
 * decide which scopes to redistribute) so the two never disagree.
 */
export const getRecalculableScopeKeys = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
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
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): boolean => getRecalculableScopeKeys({ cusEnts, entityId }).size > 0;
