import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import { applyCustomerProductItemsPatch } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";

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

export const getPatchCustomerProducts = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => autumnBillingPlan.patchCustomerProducts ?? [];

export const getPatchedCustomerProductUpdates = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const patchedCustomerProductIds = new Set(
		getPatchCustomerProducts({ autumnBillingPlan }).map(
			({ customerProduct }) => customerProduct.id,
		),
	);
	return getUpdateCustomerProducts({ autumnBillingPlan }).filter(
		({ customerProduct }) => patchedCustomerProductIds.has(customerProduct.id),
	);
};

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

export const applyCustomerProductPatch = ({
	customerProduct,
	patch,
}: {
	customerProduct: FullCusProduct;
	patch: NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number];
}): FullCusProduct =>
	applyCustomerProductItemsPatch({
		customerProduct,
		insertCustomerPrices: patch.insertCustomerPrices,
		insertCustomerEntitlements: patch.insertCustomerEntitlements,
		deleteCustomerPrices: patch.deleteCustomerPrices,
		deleteCustomerEntitlements: patch.deleteCustomerEntitlements,
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
