import type { PhaseBalances } from "../../diffPhaseBalances";

export type BalanceScope = {
	internalEntityId: string | null;
	entityId: string | null;
};

export type ScopePool = {
	total: number;
	contributors: number;
};

export type ScopedPhaseBalances = {
	scope: BalanceScope;
	balances: PhaseBalances;
	pools: Record<string, ScopePool>;
}[];
