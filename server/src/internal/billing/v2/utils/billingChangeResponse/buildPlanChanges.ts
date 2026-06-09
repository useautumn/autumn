import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerPlanChange,
	customerEntitlementToFeatureId,
	type FullCusProduct,
} from "@autumn/shared";
import { buildPlanItemChanges } from "./buildPlanItemChanges";
import { buildPreviousAttributes } from "./buildPreviousAttributes";
import { cusProductStatusToPublicStatus } from "./cusProductStatusMapping";
import { toCustomerPlanSnapshot } from "./toCustomerPlanSnapshot";

type PlanChangeEntry = {
	change: CustomerPlanChange;
	customerProduct?: FullCusProduct;
};

const getChangePlanId = (change: CustomerPlanChange): string | undefined =>
	change.subscription?.plan_id ?? change.purchase?.plan_id;

const getUpdatedChangeMergeKey = (
	change: CustomerPlanChange,
): string | undefined => {
	if (change.subscription) {
		const subscription = change.subscription;
		return [
			"subscription",
			subscription.plan_id,
			subscription.status,
			subscription.started_at,
			subscription.expires_at,
			subscription.canceled_at,
			subscription.trial_ends_at,
		].join(":");
	}

	if (change.purchase) {
		const purchase = change.purchase;
		return [
			"purchase",
			purchase.plan_id,
			purchase.status,
			purchase.expires_at,
		].join(":");
	}
};

const entitlementFeatureIds = (customerProduct: FullCusProduct) =>
	new Set(
		customerProduct.customer_entitlements.map((customerEntitlement) =>
			customerEntitlementToFeatureId(customerEntitlement),
		),
	);

const buildReplacementItemChanges = ({
	activated,
	expired,
}: {
	activated: PlanChangeEntry;
	expired: PlanChangeEntry;
}): CustomerPlanChange["item_changes"] => {
	const activatedProduct = activated.customerProduct;
	const expiredProduct = expired.customerProduct;
	if (activatedProduct === undefined || expiredProduct === undefined) {
		return [
			...(activated.change.item_changes ?? []),
			...(expired.change.item_changes ?? []),
		];
	}

	const activatedFeatureIds = entitlementFeatureIds(activatedProduct);
	const expiredFeatureIds = entitlementFeatureIds(expiredProduct);

	return [
		...buildPlanItemChanges({
			customerProduct: activatedProduct,
			insertCustomerEntitlements:
				activatedProduct.customer_entitlements.filter(
					(customerEntitlement) =>
						expiredFeatureIds.has(
							customerEntitlementToFeatureId(customerEntitlement),
						) === false,
				),
			insertCustomerPrices: activatedProduct.customer_prices,
		}),
		...buildPlanItemChanges({
			customerProduct: expiredProduct,
			deleteCustomerEntitlements: expiredProduct.customer_entitlements.filter(
				(customerEntitlement) =>
					activatedFeatureIds.has(
						customerEntitlementToFeatureId(customerEntitlement),
					) === false,
			),
			deleteCustomerPrices: expiredProduct.customer_prices,
		}),
	];
};

/**
 * When a billing action updates a plan in-place, Autumn often creates a new
 * customer product (insertCustomerProducts) and expires the old one
 * (updateCustomerProducts with status=Expired) — both sharing the same
 * plan_id. To consumers that looks like the plan briefly went away and came
 * back. Merge those pairs into a single `updated` change so the webhook
 * reflects the logical operation.
 */
const collapseSamePlanIdPairs = (
	entries: PlanChangeEntry[],
): PlanChangeEntry[] => {
	const consumed = new Set<number>();
	const result: PlanChangeEntry[] = [];

	for (let i = 0; i < entries.length; i++) {
		if (consumed.has(i)) continue;
		const entry = entries[i];
		const { change } = entry;

		const canCollapse =
			change.action === "activated" || change.action === "expired";
		if (canCollapse === false) {
			result.push(entry);
			continue;
		}

		const planId = getChangePlanId(change);
		const counterpartAction =
			change.action === "activated" ? "expired" : "activated";

		const pairIdx = entries.findIndex((other, j) => {
			if (j === i) return false;
			if (consumed.has(j)) return false;
			return (
				other.change.action === counterpartAction &&
				getChangePlanId(other.change) === planId
			);
		});

		if (pairIdx < 0) {
			result.push(entry);
			continue;
		}

		// Mark BOTH ends of the pair consumed — otherwise a later iteration's
		// `findIndex` could re-match the current index `i` (the loop's
		// top-of-iteration `consumed.has(i)` only guards revisiting `i` as
		// the iterator, not as a pairing candidate).
		consumed.add(i);
		consumed.add(pairIdx);
		const pair = entries[pairIdx];
		const activated = change.action === "activated" ? entry : pair;
		const expired = change.action === "expired" ? entry : pair;

		result.push({
			customerProduct: activated.customerProduct,
			change: {
				action: "updated",
				subscription: activated.change.subscription,
				purchase: activated.change.purchase,
				previous_attributes: expired.change.previous_attributes,
				item_changes: buildReplacementItemChanges({
					activated,
					expired,
				}),
			},
		});
	}

	return result;
};

const mergeUpdatedPlanChanges = (
	entries: PlanChangeEntry[],
): PlanChangeEntry[] => {
	const merged = new Map<string, PlanChangeEntry>();
	const result: PlanChangeEntry[] = [];

	for (const entry of entries) {
		const { change } = entry;
		const mergeKey = getUpdatedChangeMergeKey(change);
		if (change.action === "updated" && mergeKey) {
			const existing = merged.get(mergeKey);
			if (existing) {
				existing.change.subscription =
					existing.change.subscription ?? change.subscription;
				existing.change.purchase = existing.change.purchase ?? change.purchase;
				existing.change.previous_attributes = {
					...(existing.change.previous_attributes ?? {}),
					...(change.previous_attributes ?? {}),
				};
				existing.change.item_changes = [
					...(existing.change.item_changes ?? []),
					...(change.item_changes ?? []),
				];
				continue;
			}

			merged.set(mergeKey, entry);
			result.push(entry);
			continue;
		}

		result.push(entry);
	}

	return result;
};

export const buildPlanChanges = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): CustomerPlanChange[] => {
	const entries: PlanChangeEntry[] = [];

	for (const cusProduct of autumnBillingPlan.insertCustomerProducts ?? []) {
		const action =
			cusProduct.status === CusProductStatus.Scheduled
				? "scheduled"
				: "activated";
		entries.push({
			customerProduct: cusProduct,
			change: {
				action,
				...toCustomerPlanSnapshot({ cusProduct }),
				previous_attributes: null,
				item_changes: [],
			},
		});
	}

	const updates = [
		...(autumnBillingPlan.updateCustomerProduct
			? [autumnBillingPlan.updateCustomerProduct]
			: []),
		...(autumnBillingPlan.updateCustomerProducts ?? []),
	];

	for (const update of updates) {
		const originalCusProduct = update.customerProduct;
		const previousAttributes = buildPreviousAttributes({
			originalCusProduct,
			updates: update.updates,
		});

		// Action is derived from the public lifecycle transition:
		//   non-active → "active"  ⇒ "activated"  (e.g. scheduled → active)
		//   anything → "expired"   ⇒ "expired"
		//   else                   ⇒ "updated"
		const beforePublic = cusProductStatusToPublicStatus(
			originalCusProduct.status,
		);
		const afterPublic = cusProductStatusToPublicStatus(
			update.updates.status ?? originalCusProduct.status,
		);

		let action: CustomerPlanChange["action"];
		if (afterPublic === "expired") {
			action = "expired";
		} else if (beforePublic !== "active" && afterPublic === "active") {
			action = "activated";
		} else {
			action = "updated";
		}

		entries.push({
			customerProduct: originalCusProduct,
			change: {
				action,
				...toCustomerPlanSnapshot({
					cusProduct: originalCusProduct,
					overrides: {
						status: update.updates.status,
						canceled_at: update.updates.canceled_at,
						ended_at: update.updates.ended_at,
						trial_ends_at: update.updates.trial_ends_at,
					},
				}),
				previous_attributes: previousAttributes,
				item_changes: [],
			},
		});
	}

	for (const patch of autumnBillingPlan.patchCustomerProducts ?? []) {
		entries.push({
			customerProduct: patch.customerProduct,
			change: {
				action: "updated",
				...toCustomerPlanSnapshot({ cusProduct: patch.customerProduct }),
				previous_attributes: {},
				item_changes: buildPlanItemChanges({
					customerProduct: patch.customerProduct,
					insertCustomerEntitlements: patch.insertCustomerEntitlements,
					deleteCustomerEntitlements: patch.deleteCustomerEntitlements,
					insertCustomerPrices: patch.insertCustomerPrices,
					deleteCustomerPrices: patch.deleteCustomerPrices,
				}),
			},
		});
	}

	return mergeUpdatedPlanChanges(collapseSamePlanIdPairs(entries)).map(
		(entry) => entry.change,
	);
};
