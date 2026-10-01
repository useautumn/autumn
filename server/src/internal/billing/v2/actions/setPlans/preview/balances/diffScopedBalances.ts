import type {
	SetPlansPreviewBalanceChange,
	SetPlansPreviewPooledBalance,
} from "@autumn/shared";
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

const entryIn = ({
	scopedBalances,
	scope,
}: {
	scopedBalances: ScopedPhaseBalances;
	scope: BalanceScope;
}) =>
	scopedBalances.find(
		(entry) => entry.scope.internalEntityId === scope.internalEntityId,
	);

/** The feature's pool as any contributing scope sees it; a scope that stopped pooling still reports what remains. */
const poolIn = ({
	scopedBalances,
	featureId,
}: {
	scopedBalances: ScopedPhaseBalances;
	featureId: string;
}) => scopedBalances.find(({ pools }) => pools[featureId])?.pools[featureId];

/** The shared pool behind a scope's change, when the scope pools the feature on either side. */
const pooledBalanceChange = ({
	before,
	after,
	scope,
	featureId,
}: {
	before: ScopedPhaseBalances;
	after: ScopedPhaseBalances;
	scope: BalanceScope;
	featureId: string;
}): SetPlansPreviewPooledBalance | undefined => {
	const poolBefore = entryIn({ scopedBalances: before, scope })?.pools[
		featureId
	];
	const scopePoolAfter = entryIn({ scopedBalances: after, scope })?.pools[
		featureId
	];
	if (!poolBefore && !scopePoolAfter) return undefined;

	const poolAfter =
		scopePoolAfter ?? poolIn({ scopedBalances: after, featureId });
	return {
		previous_total: poolBefore?.total ?? null,
		total: poolAfter?.total ?? 0,
		contributors: poolAfter?.contributors ?? 0,
	};
};

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
			before: entryIn({ scopedBalances: before, scope })?.balances ?? {},
			after: entryIn({ scopedBalances: after, scope })?.balances ?? {},
		}).map((diff) => {
			const pooled = pooledBalanceChange({
				before,
				after,
				scope,
				featureId: diff.feature_id,
			});
			return {
				...diff,
				entity_id: scope.entityId,
				...(pooled ? { pooled } : {}),
			};
		}),
	);
