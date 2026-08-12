import {
	CusProductStatus,
	type CustomerPlanChange,
	cusProductToProduct,
	customerProductToApiSubscriptionStatus,
	type FullCusProduct,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { buildLifecyclePreviousAttributes } from "./buildLifecyclePreviousAttributes";
import { toCustomerPlanSnapshot } from "./toCustomerPlanSnapshot";

export type CustomerProductTransition = {
	before: FullCusProduct | null;
	after: FullCusProduct | null;
};

export const deriveCustomerPlanChangeAction = ({
	before,
	after,
}: {
	before: FullCusProduct | null;
	after: FullCusProduct;
}): CustomerPlanChange["action"] => {
	if (before === null) {
		return after.status === CusProductStatus.Scheduled
			? "scheduled"
			: "activated";
	}

	const beforePublic = customerProductToApiSubscriptionStatus({
		status: before.status,
	});
	const afterPublic = customerProductToApiSubscriptionStatus({
		status: after.status,
	});
	if (afterPublic === "expired") return "expired";
	if (beforePublic !== "active" && afterPublic === "active") return "activated";
	return "updated";
};

/**
 * Kernel: one customer product's before/after states → one CustomerPlanChange.
 * `before: null` means newly inserted; `after: null` (deleted) is not surfaced.
 */
export const buildCustomerPlanChange = ({
	before,
	after,
}: CustomerProductTransition): CustomerPlanChange | undefined => {
	if (after === null) return undefined;

	const action = deriveCustomerPlanChangeAction({ before, after });
	const snapshot = toCustomerPlanSnapshot({ cusProduct: after });

	if (before === null) {
		return {
			action,
			...snapshot,
			previous_attributes: null,
			item_changes: [],
		};
	}

	return {
		action,
		...snapshot,
		previous_attributes: buildLifecyclePreviousAttributes({ before, after }),
		// Deprecated in favor of plan_change.item_changes.
		item_changes: [],
		plan_change: buildPlanChangeFromFullProducts({
			from: cusProductToProduct({ cusProduct: before }),
			to: cusProductToProduct({ cusProduct: after }),
		}),
	};
};
