import type { SetPlansPreviewBalanceChange } from "@autumn/shared";
import { diffPhaseBalances } from "../diffPhaseBalances";
import type {
	BalanceScope,
	ScopedPhaseBalances,
} from "./types/scopedPhaseBalances";

const scopesOf = ({
	before,
	after,
}: {
	before: ScopedPhaseBalances;
	after: ScopedPhaseBalances;
}): BalanceScope[] => {
	const scopes = new Map<string | null, BalanceScope>();
	for (const { scope } of [...before, ...after]) {
		if (!scopes.has(scope.internalEntityId)) {
			scopes.set(scope.internalEntityId, scope);
		}
	}
	return [...scopes.values()];
};

const balancesIn = ({
	scopedBalances,
	scope,
}: {
	scopedBalances: ScopedPhaseBalances;
	scope: BalanceScope;
}) =>
	scopedBalances.find(
		(entry) => entry.scope.internalEntityId === scope.internalEntityId,
	)?.balances ?? {};

/** Each scope's balance changes between two moments, tagged with the entity they belong to. */
export const diffScopedBalances = ({
	before,
	after,
}: {
	before: ScopedPhaseBalances;
	after: ScopedPhaseBalances;
}): SetPlansPreviewBalanceChange[] =>
	scopesOf({ before, after }).flatMap((scope) =>
		diffPhaseBalances({
			before: balancesIn({ scopedBalances: before, scope }),
			after: balancesIn({ scopedBalances: after, scope }),
		}).map((diff) => ({ ...diff, entity_id: scope.entityId })),
	);
