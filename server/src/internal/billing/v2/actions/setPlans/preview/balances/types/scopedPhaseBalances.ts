import type { PhaseBalances } from "../../diffPhaseBalances";

/** Whose plans hold a balance: an entity, or the customer itself when both ids are null. */
export type BalanceScope = {
	internalEntityId: string | null;
	entityId: string | null;
};

/** The shared pool a scope's plans feed for one feature. */
export type ScopePool = {
	total: number;
	contributors: number;
};

/** A customer's balances split by scope, so one entity's change never blends into another's. */
export type ScopedPhaseBalances = {
	scope: BalanceScope;
	balances: PhaseBalances;
	pools: Record<string, ScopePool>;
}[];
