import type { WorkerCustomerProduct } from "../../models/subject/rows/workerCustomerProduct.js";
import type { SubjectState } from "../../models/subject/subjectState.js";

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
