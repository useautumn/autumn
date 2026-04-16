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

export const getExpiredUpdatedCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	getUpdateCustomerProducts({ autumnBillingPlan })
		.filter((update) => update.updates.status === CusProductStatus.Expired)
		.map((update) => update.customerProduct);
