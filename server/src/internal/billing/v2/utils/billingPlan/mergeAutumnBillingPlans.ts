import type { AutumnBillingPlan } from "@autumn/shared";
import { mergeById, mergeByKey } from "./mergeByKey";
import { mergePooledBalancePlans } from "./mergePooledBalancePlans";

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
	insertPlanLicenses: mergeByKey({
		base: base.insertPlanLicenses,
		incoming: incoming.insertPlanLicenses,
		getKey: (spec) => spec.row.id,
	}),
	customerLicenseUpdates: mergeByKey({
		base: base.customerLicenseUpdates,
		incoming: incoming.customerLicenseUpdates,
		getKey: (update) =>
			update.customerLicenseId ?? update.customerLicenseLinkId ?? "",
	}),
	customerLicenseTransitions: mergeByKey({
		base: base.customerLicenseTransitions,
		incoming: incoming.customerLicenseTransitions,
		getKey: (transition) => transition.incomingCustomerLicense.id,
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
	pooledBalancePlan: mergePooledBalancePlans({
		base: base.pooledBalancePlan,
		incoming: incoming.pooledBalancePlan,
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
	upsertSubscriptions: mergeByKey({
		base: base.upsertSubscriptions,
		incoming: incoming.upsertSubscriptions,
		getKey: (subscription) => subscription.stripe_id ?? subscription.id,
	}),
	upsertInvoice: incoming.upsertInvoice ?? base.upsertInvoice,
	refundPlan: incoming.refundPlan ?? base.refundPlan,
});

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
