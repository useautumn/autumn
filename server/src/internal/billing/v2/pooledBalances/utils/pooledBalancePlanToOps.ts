import type {
	PooledBalanceOp,
	PooledBalancePlan,
	UpsertPooledBalanceSourceSpec,
} from "@autumn/shared";

export const upsertSourceSpecToOp = ({
	internalCustomerId,
	pooledBalance,
	contribution,
	usageCarry,
}: UpsertPooledBalanceSourceSpec): Extract<
	PooledBalanceOp,
	{ op: "upsert_source" }
> => ({
	op: "upsert_source",
	internalCustomerId,
	...pooledBalance,
	...contribution,
	...(usageCarry ? { usageReapply: usageCarry } : {}),
});

// Removals precede upserts: sources leave the pool before new sources join.
export const pooledBalancePlanToOps = ({
	pooledBalancePlan,
}: {
	pooledBalancePlan?: PooledBalancePlan;
}): PooledBalanceOp[] => [
	...(pooledBalancePlan?.removeSources ?? []).map((removeSource) => ({
		...removeSource,
		op: "remove_source" as const,
	})),
	...(pooledBalancePlan?.upsertSources ?? []).map(upsertSourceSpecToOp),
];
