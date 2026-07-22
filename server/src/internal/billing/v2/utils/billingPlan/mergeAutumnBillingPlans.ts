import { type AutumnBillingPlan, addSafe } from "@autumn/shared";

export const mergeAutumnBillingPlans = ({
	base,
	incoming,
}: {
	base: AutumnBillingPlan;
	incoming: AutumnBillingPlan;
}): AutumnBillingPlan => ({
	...base,
	insertCustomerProducts: mergeById({
		base: base.insertCustomerProducts,
		incoming: incoming.insertCustomerProducts,
	}),
	updateCustomerProduct: undefined,
	updateCustomerProducts: mergeByKey({
		base: [
			...(base.updateCustomerProduct ? [base.updateCustomerProduct] : []),
			...(base.updateCustomerProducts ?? []),
		],
		incoming: [
			...(incoming.updateCustomerProduct
				? [incoming.updateCustomerProduct]
				: []),
			...(incoming.updateCustomerProducts ?? []),
		],
		getKey: (update) => update.customerProduct.id,
	}),
	deleteCustomerProduct: undefined,
	deleteCustomerProducts: mergeById({
		base: [
			...(base.deleteCustomerProduct ? [base.deleteCustomerProduct] : []),
			...(base.deleteCustomerProducts ?? []),
		],
		incoming: [
			...(incoming.deleteCustomerProduct
				? [incoming.deleteCustomerProduct]
				: []),
			...(incoming.deleteCustomerProducts ?? []),
		],
	}),
	schedulePhaseCustomerProductReplacements: mergeByKey({
		base: base.schedulePhaseCustomerProductReplacements,
		incoming: incoming.schedulePhaseCustomerProductReplacements,
		getKey: (replacement) => replacement.oldCustomerProductId,
	}),
	customPrices: mergeById({
		base: base.customPrices,
		incoming: incoming.customPrices,
	}),
	customEntitlements: mergeById({
		base: base.customEntitlements,
		incoming: incoming.customEntitlements,
	}),
	customFreeTrial: incoming.customFreeTrial ?? base.customFreeTrial,
	lineItems: mergeById({
		base: base.lineItems,
		incoming: incoming.lineItems,
	}),
	customLineItems: mergeByKey({
		base: base.customLineItems,
		incoming: incoming.customLineItems,
		getKey: (lineItem) => `${lineItem.description}:${lineItem.amount}`,
	}),
	insertCustomerEntitlements: mergeById({
		base: base.insertCustomerEntitlements,
		incoming: incoming.insertCustomerEntitlements,
	}),
	patchCustomerProducts: mergePatchCustomerProducts({
		base: base.patchCustomerProducts,
		incoming: incoming.patchCustomerProducts,
	}),
	updateCustomerEntitlements: mergeByKey({
		base: base.updateCustomerEntitlements,
		incoming: incoming.updateCustomerEntitlements,
		getKey: (update) => update.customerEntitlement.id,
	}),
	pooledBalancePlan:
		base.pooledBalancePlan || incoming.pooledBalancePlan
			? {
					insertPoolBalances:
						mergeByKey({
							base: base.pooledBalancePlan?.insertPoolBalances,
							incoming: incoming.pooledBalancePlan?.insertPoolBalances,
							getKey: (pooledCustomerEntitlement) =>
								pooledCustomerEntitlement.id,
						}) ?? [],
					updatePoolBalances: mergePooledBalanceUpdates({
						base: base.pooledBalancePlan?.updatePoolBalances,
						incoming: incoming.pooledBalancePlan?.updatePoolBalances,
					}),
					insertPoolContributions:
						mergeById({
							base: base.pooledBalancePlan?.insertPoolContributions,
							incoming: incoming.pooledBalancePlan?.insertPoolContributions,
						}) ?? [],
					updatePoolContributions:
						mergeById({
							base: base.pooledBalancePlan?.updatePoolContributions,
							incoming: incoming.pooledBalancePlan?.updatePoolContributions,
						}) ?? [],
					deletePoolContributions:
						mergeById({
							base: base.pooledBalancePlan?.deletePoolContributions,
							incoming: incoming.pooledBalancePlan?.deletePoolContributions,
						}) ?? [],
				}
			: undefined,
	autoTopupRebalance:
		base.autoTopupRebalance || incoming.autoTopupRebalance
			? {
					deltas:
						mergeByKey({
							base: base.autoTopupRebalance?.deltas,
							incoming: incoming.autoTopupRebalance?.deltas,
							getKey: (delta) => delta.cusEntId,
						}) ?? [],
				}
			: undefined,
	oneOffPurchaseRebalance:
		base.oneOffPurchaseRebalance || incoming.oneOffPurchaseRebalance
			? {
					purchases:
						mergeByKey({
							base: base.oneOffPurchaseRebalance?.purchases,
							incoming: incoming.oneOffPurchaseRebalance?.purchases,
							getKey: (purchase) => purchase.customerEntitlementId,
						}) ?? [],
				}
			: undefined,
	upsertSubscription: incoming.upsertSubscription ?? base.upsertSubscription,
	upsertInvoice: incoming.upsertInvoice ?? base.upsertInvoice,
	refundPlan: incoming.refundPlan ?? base.refundPlan,
});

const mergeById = <T extends { id: string }>({
	base,
	incoming,
}: {
	base?: T[];
	incoming?: T[];
}): T[] => mergeByKey({ base, incoming, getKey: (item) => item.id }) ?? [];

const mergeByKey = <T>({
	base,
	incoming,
	getKey,
}: {
	base?: T[];
	incoming?: T[];
	getKey: (item: T) => string;
}): T[] | undefined => {
	if (!base?.length && !incoming?.length) return undefined;

	const itemByKey = new Map<string, T>();
	for (const item of base ?? []) itemByKey.set(getKey(item), item);
	for (const item of incoming ?? []) itemByKey.set(getKey(item), item);

	return Array.from(itemByKey.values());
};

type PooledBalanceUpdate = NonNullable<
	AutumnBillingPlan["pooledBalancePlan"]
>["updatePoolBalances"][number];

const mergePooledBalanceUpdates = ({
	base,
	incoming,
}: {
	base?: PooledBalanceUpdate[];
	incoming?: PooledBalanceUpdate[];
}): PooledBalanceUpdate[] => {
	const updatesByPoolId = new Map<string, PooledBalanceUpdate>();

	for (const update of [...(base ?? []), ...(incoming ?? [])]) {
		const poolId = update.pooledCustomerEntitlement.id;
		const existing = updatesByPoolId.get(poolId);
		updatesByPoolId.set(
			poolId,
			existing
				? {
						pooledCustomerEntitlement: update.pooledCustomerEntitlement,
						balanceDelta: addSafe({
							left: existing.balanceDelta,
							right: update.balanceDelta,
						}),
						grantedDelta: addSafe({
							left: existing.grantedDelta,
							right: update.grantedDelta,
						}),
					}
				: update,
		);
	}

	return Array.from(updatesByPoolId.values());
};

type PatchCustomerProduct = NonNullable<
	AutumnBillingPlan["patchCustomerProducts"]
>[number];

const mergePatchCustomerProducts = ({
	base,
	incoming,
}: {
	base?: PatchCustomerProduct[];
	incoming?: PatchCustomerProduct[];
}): PatchCustomerProduct[] | undefined =>
	mergeByKey({
		base,
		incoming,
		getKey: (patch) =>
			[
				patch.customerProduct.id,
				...patch.insertCustomerEntitlements.map(({ id }) => `ie:${id}`),
				...patch.insertCustomerPrices.map(({ id }) => `ip:${id}`),
				...patch.deleteCustomerEntitlements.map(({ id }) => `de:${id}`),
				...patch.deleteCustomerPrices.map(({ id }) => `dp:${id}`),
			].join("|"),
	});
