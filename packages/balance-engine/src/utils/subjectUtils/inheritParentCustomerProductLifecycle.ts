import type { WorkerCustomerProduct } from "../../models/subject/rows/workerCustomerProduct.js";
import type { SubjectState } from "../../models/subject/subjectState.js";

/** What a seat mirrors from its parent; the parent's own columns, absent ones left absent. */
const lifecycleOf = ({
	parent,
}: {
	parent: WorkerCustomerProduct;
}): Pick<
	WorkerCustomerProduct,
	"status" | "subscription_ids" | "canceled_at"
> => ({
	status: parent.status,
	...("subscription_ids" in parent && {
		subscription_ids: parent.subscription_ids,
	}),
	...("canceled_at" in parent && { canceled_at: parent.canceled_at }),
});

/** The live parent behind a seat's license link, when the state holds one. */
const findSeatParent = ({
	row,
	state,
}: {
	row: WorkerCustomerProduct;
	state: SubjectState;
}): WorkerCustomerProduct | undefined => {
	for (const license of state.customerLicenses) {
		if (license.link_id !== row.customer_license_link_id) continue;
		const parent = state.customerProducts.find(
			(candidate) => candidate.id === license.parent_customer_product_id,
		);
		if (parent) return parent;
	}
	return undefined;
};

/**
 * A seat owns no lifecycle: its parent, reached through the license link, lends it status,
 * subscriptions and cancellation. No live parent in state means the seat is dead and is left out.
 */
export const inheritParentCustomerProductLifecycle = ({
	row,
	state,
}: {
	row: WorkerCustomerProduct;
	state: SubjectState;
}): WorkerCustomerProduct | null => {
	if (row.customer_license_link_id === null) return row;
	const parent = findSeatParent({ row, state });
	if (!parent) return null;
	return { ...row, ...lifecycleOf({ parent }) };
};
