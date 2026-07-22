import type { AutumnBillingPlan } from "@autumn/shared";

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
	releaseCustomerLicenseAssignments:
		base.releaseCustomerLicenseAssignments ||
		incoming.releaseCustomerLicenseAssignments
			? {
					internalCustomerId: (incoming.releaseCustomerLicenseAssignments ??
						base.releaseCustomerLicenseAssignments)!.internalCustomerId,
					customerLicensePools:
						mergeByKey({
							base: base.releaseCustomerLicenseAssignments
								?.customerLicensePools,
							incoming:
								incoming.releaseCustomerLicenseAssignments
									?.customerLicensePools,
							getKey: (pool) => pool.id,
						}) ?? [],
					releasedAt: Math.max(
						base.releaseCustomerLicenseAssignments?.releasedAt ?? 0,
						incoming.releaseCustomerLicenseAssignments?.releasedAt ?? 0,
					),
				}
			: undefined,
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
