import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

export const getUpdateCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => [
	...(autumnBillingPlan.updateCustomerProduct
		? [autumnBillingPlan.updateCustomerProduct]
		: []),
	...(autumnBillingPlan.updateCustomerProducts ?? []),
];

export const getDeleteCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => [
	...(autumnBillingPlan.deleteCustomerProduct
		? [autumnBillingPlan.deleteCustomerProduct]
		: []),
	...(autumnBillingPlan.deleteCustomerProducts ?? []),
];

export const applyCustomerProductUpdate = ({
	customerProduct,
	updates,
}: {
	customerProduct: FullCusProduct;
	updates: NonNullable<
		ReturnType<typeof getUpdateCustomerProducts>[number]
	>["updates"];
}): FullCusProduct => ({
	...customerProduct,
	...updates,
	canceled: updates.canceled ?? customerProduct.canceled,
});

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

/** Apply schedule phase end timing to a customer product plan result. */
export const applyScheduleTimingToCustomerProductPlan = ({
	result,
	endedAt,
}: {
	result: {
		insertCustomerProduct?: FullCusProduct;
		updateCustomerProduct?: CustomerProductUpdate;
	};
	endedAt: number | null;
}) => {
	if (result.insertCustomerProduct) {
		result.insertCustomerProduct.ended_at = endedAt;
		result.insertCustomerProduct.scheduled_ids = [];
	} else if (result.updateCustomerProduct) {
		result.updateCustomerProduct.updates.ended_at = endedAt;
		result.updateCustomerProduct.updates.scheduled_ids = [];
	}
};

export const getExpiredUpdatedCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	getUpdateCustomerProducts({ autumnBillingPlan })
		.filter((update) => update.updates.status === CusProductStatus.Expired)
		.map((update) => update.customerProduct);
