import type {
	AutumnBillingPlan,
	PooledBalanceOp,
	PooledBalancePlan,
} from "@autumn/shared";

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
	customerLicenseTransitions: mergeByKey({
		base: base.customerLicenseTransitions,
		incoming: incoming.customerLicenseTransitions,
		getKey: (transition) =>
			`${transition.outgoingCustomerLicense.id}:${transition.incomingCustomerLicense.id}`,
	}),
	customPrices: mergeById({
		base: base.customPrices,
		incoming: incoming.customPrices,
	}),
	customEntitlements: mergeById({
		base: base.customEntitlements,
		incoming: incoming.customEntitlements,
	}),
	pooledBalancePlan: mergePooledBalancePlan({
		base: base.pooledBalancePlan,
		incoming: incoming.pooledBalancePlan,
	}),
	pooledBalanceOps: mergePooledBalanceOps({
		base: base.pooledBalanceOps,
		incoming: incoming.pooledBalanceOps,
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

const pooledBalanceOperationKey = (operation: PooledBalanceOp): string => {
	switch (operation.op) {
		case "upsert_source":
			return `${operation.sourceCustomerProductId}:${operation.sourceEntitlementId}`;
		case "remove_source":
			return `${operation.sourceCustomerProductId}:remove`;
		case "remove_contribution":
			return `${operation.sourceCustomerProductId}:${operation.sourceEntitlementId}:remove`;
		case "restore_source":
			return `${operation.sourceCustomerProductId}:restore`;
		case "transfer_source":
			return `${operation.contributionId}:transfer`;
		case "stage_owner_removal":
		case "restore_owner":
			return `owner:${operation.customerLicenseLinkId}`;
	}
};

const keepLastOperationByKey = (
	operations: PooledBalanceOp[],
): PooledBalanceOp[] => {
	const seen = new Set<string>();
	const reversed: PooledBalanceOp[] = [];
	for (let index = operations.length - 1; index >= 0; index -= 1) {
		const operation = operations[index];
		const key = pooledBalanceOperationKey(operation);
		if (seen.has(key)) continue;
		seen.add(key);
		reversed.push(operation);
	}
	return reversed.reverse();
};

const mergePooledBalanceOps = ({
	base,
	incoming,
}: {
	base?: PooledBalanceOp[];
	incoming?: PooledBalanceOp[];
}): PooledBalanceOp[] | undefined => {
	if (!base?.length && !incoming?.length) return undefined;

	const uniqueIncoming = keepLastOperationByKey(incoming ?? []);
	const incomingKeys = new Set(uniqueIncoming.map(pooledBalanceOperationKey));
	const uniqueBase =
		mergeByKey({
			base,
			incoming: [],
			getKey: pooledBalanceOperationKey,
		}) ?? [];
	const remainingBase = uniqueBase.filter(
		(operation) => !incomingKeys.has(pooledBalanceOperationKey(operation)),
	);
	return [...remainingBase, ...uniqueIncoming];
};

const mergeSourcesByKey = <Source>({
	base,
	incoming,
	getKey,
}: {
	base?: Source[];
	incoming?: Source[];
	getKey: (source: Source) => string;
}): Source[] | undefined => {
	if (!base?.length && !incoming?.length) return undefined;
	const merged = new Map<string, Source>();
	for (const source of [...(base ?? []), ...(incoming ?? [])]) {
		merged.set(getKey(source), source);
	}
	return [...merged.values()];
};

const mergePooledBalancePlan = ({
	base,
	incoming,
}: {
	base?: PooledBalancePlan;
	incoming?: PooledBalancePlan;
}): PooledBalancePlan | undefined => {
	const removeSources = mergeSourcesByKey({
		base: base?.removeSources,
		incoming: incoming?.removeSources,
		getKey: (source) => source.sourceCustomerProductId,
	});
	const upsertSources = mergeSourcesByKey({
		base: base?.upsertSources,
		incoming: incoming?.upsertSources,
		getKey: (source) =>
			`${source.contribution.sourceCustomerProductId}:${source.contribution.sourceEntitlementId}`,
	});
	if (!removeSources && !upsertSources) return undefined;
	return {
		...(removeSources ? { removeSources } : {}),
		...(upsertSources ? { upsertSources } : {}),
	};
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
