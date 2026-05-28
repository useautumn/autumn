import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerPlanChange,
} from "@autumn/shared";
import { buildPlanItemChanges } from "./buildPlanItemChanges";
import { buildPreviousAttributes } from "./buildPreviousAttributes";
import { cusProductStatusToPublicStatus } from "./cusProductStatusMapping";
import { toCustomerPlanSnapshot } from "./toCustomerPlanSnapshot";

const getChangePlanId = (change: CustomerPlanChange): string | undefined =>
	change.subscription?.plan_id ?? change.purchase?.plan_id;

/**
 * When a billing action updates a plan in-place, Autumn often creates a new
 * customer product (insertCustomerProducts) and expires the old one
 * (updateCustomerProducts with status=Expired) — both sharing the same
 * plan_id. To consumers that looks like the plan briefly went away and came
 * back. Merge those pairs into a single `updated` change so the webhook
 * reflects the logical operation.
 */
const collapseSamePlanIdPairs = (
	changes: CustomerPlanChange[],
): CustomerPlanChange[] => {
	const consumed = new Set<number>();
	const result: CustomerPlanChange[] = [];

	for (let i = 0; i < changes.length; i++) {
		if (consumed.has(i)) continue;
		const change = changes[i];

		if (change.action !== "activated" && change.action !== "expired") {
			result.push(change);
			continue;
		}

		const planId = getChangePlanId(change);
		const counterpartAction =
			change.action === "activated" ? "expired" : "activated";

		const pairIdx = changes.findIndex(
			(other, j) =>
				j !== i &&
				!consumed.has(j) &&
				other.action === counterpartAction &&
				getChangePlanId(other) === planId,
		);

		if (pairIdx < 0) {
			result.push(change);
			continue;
		}

		// Mark BOTH ends of the pair consumed — otherwise a later iteration's
		// `findIndex` could re-match the current index `i` (the loop's
		// top-of-iteration `consumed.has(i)` only guards revisiting `i` as
		// the iterator, not as a pairing candidate).
		consumed.add(i);
		consumed.add(pairIdx);
		const activatedChange = change.action === "activated" ? change : changes[pairIdx];
		const expiredChange = change.action === "expired" ? change : changes[pairIdx];

		result.push({
			action: "updated",
			subscription: activatedChange.subscription,
			purchase: activatedChange.purchase,
			previous_attributes: expiredChange.previous_attributes,
			item_changes: [],
		});
	}

	return result;
};

const mergeUpdatedPlanChanges = (
	changes: CustomerPlanChange[],
): CustomerPlanChange[] => {
	const merged = new Map<string, CustomerPlanChange>();
	const result: CustomerPlanChange[] = [];

	for (const change of changes) {
		const planId = getChangePlanId(change);
		if (change.action !== "updated" || !planId) {
			result.push(change);
			continue;
		}

		const existing = merged.get(planId);
		if (!existing) {
			merged.set(planId, change);
			result.push(change);
			continue;
		}

		existing.subscription = existing.subscription ?? change.subscription;
		existing.purchase = existing.purchase ?? change.purchase;
		existing.previous_attributes = {
			...(existing.previous_attributes ?? {}),
			...(change.previous_attributes ?? {}),
		};
		existing.item_changes = [
			...(existing.item_changes ?? []),
			...(change.item_changes ?? []),
		];
	}

	return result;
};

export const buildPlanChanges = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): CustomerPlanChange[] => {
	const changes: CustomerPlanChange[] = [];

	for (const cusProduct of autumnBillingPlan.insertCustomerProducts ?? []) {
		const action =
			cusProduct.status === CusProductStatus.Scheduled
				? "scheduled"
				: "activated";
		changes.push({
			action,
			...toCustomerPlanSnapshot({ cusProduct }),
			previous_attributes: null,
			item_changes: [],
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

		changes.push({
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
		});
	}

	for (const patch of autumnBillingPlan.patchCustomerProducts ?? []) {
		changes.push({
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
		});
	}

	return mergeUpdatedPlanChanges(collapseSamePlanIdPairs(changes));
};
