import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
	getDeleteCustomerProducts,
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

const acceptedFields = new Set<keyof AutumnBillingPlan>([
	"customerId",
	"insertCustomerProducts",
	"updateCustomerProduct",
	"updateCustomerProducts",
	"deleteCustomerProduct",
	"deleteCustomerProducts",
	"patchCustomerProducts",
	"updateCustomerEntitlements",
	"updateByStripeScheduleId",
	"lineItems",
	"customLineItems",
	"refundPlan",
]);

const reject = (message: string): never => {
	throw new RecaseError({
		message: `billing.rollback: ${message}`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const hasValue = (value: unknown) =>
	value !== undefined && (!Array.isArray(value) || value.length > 0);

const previousValues = <T extends object, U extends object>({
	before,
	updates,
}: {
	before: T;
	updates: U;
}): U =>
	Object.fromEntries(
		Object.keys(updates).map((key) => [key, before[key as keyof T]]),
	) as U;

const compact = <T>(values: T[] | undefined) =>
	values?.length ? values : undefined;

export const computeRollbackPlan = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	const unsupportedFields = Object.entries(autumnBillingPlan)
		.filter(
			([key, value]) =>
				!acceptedFields.has(key as keyof AutumnBillingPlan) && hasValue(value),
		)
		.map(([key]) => key);
	if (unsupportedFields.length > 0) {
		reject(`unsupported operations: ${unsupportedFields.join(", ")}`);
	}

	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(({ id }) => id),
	);
	const deletedCustomerProducts = getDeleteCustomerProducts({
		autumnBillingPlan,
	});
	const deletedCustomerProductIds = new Set(
		deletedCustomerProducts.map(({ id }) => id),
	);
	const insertedCustomerProducts =
		autumnBillingPlan.insertCustomerProducts.filter(
			({ id }) => !deletedCustomerProductIds.has(id),
		);
	const restoredCustomerProducts = deletedCustomerProducts.filter(
		({ id }) => !insertedCustomerProductIds.has(id),
	);
	const patches = getPatchCustomerProducts({ autumnBillingPlan });
	const patchedInsertedCustomerEntitlementIds = new Set(
		patches.flatMap(({ insertCustomerEntitlements }) =>
			insertCustomerEntitlements.map(({ id }) => id),
		),
	);
	for (const { customerProduct } of patches) {
		if (
			insertedCustomerProductIds.has(customerProduct.id) ||
			deletedCustomerProductIds.has(customerProduct.id)
		) {
			reject("overlapping customer product patches are unsupported");
		}
	}

	const seenCustomerEntitlementIds = new Set<string>();
	for (const {
		customerEntitlement,
	} of autumnBillingPlan.updateCustomerEntitlements ?? []) {
		if (seenCustomerEntitlementIds.has(customerEntitlement.id)) {
			reject("duplicate customer entitlement updates are unsupported");
		}
		seenCustomerEntitlementIds.add(customerEntitlement.id);
		if (
			customerEntitlement.customer_product_id &&
			deletedCustomerProductIds.has(customerEntitlement.customer_product_id) &&
			!insertedCustomerProductIds.has(customerEntitlement.customer_product_id)
		) {
			reject("updates to deleted customer products are unsupported");
		}
	}

	const updateCustomerEntitlements: NonNullable<
		AutumnBillingPlan["updateCustomerEntitlements"]
	> = [];
	for (const update of (autumnBillingPlan.updateCustomerEntitlements ?? [])
		.slice()
		.reverse()) {
		const customerProductId =
			update.customerEntitlement.customer_product_id ??
			reject("loose customer entitlement updates are unsupported");
		if (
			insertedCustomerProductIds.has(customerProductId) ||
			patchedInsertedCustomerEntitlementIds.has(update.customerEntitlement.id)
		) {
			continue;
		}
		updateCustomerEntitlements.push(
			update.updates
				? {
						customerEntitlement: update.customerEntitlement,
						updates: previousValues({
							before: update.customerEntitlement,
							updates: update.updates,
						}),
					}
				: {
						customerEntitlement: update.customerEntitlement,
						balanceChange: update.balanceChange
							? -update.balanceChange
							: undefined,
						insertReplaceables: update.deletedReplaceables,
						deletedReplaceables: update.insertReplaceables?.map(
							(replaceable) => ({
								...replaceable,
								from_entity_id: replaceable.from_entity_id ?? null,
								delete_next_cycle: replaceable.delete_next_cycle ?? false,
							}),
						),
					},
		);
	}
	for (const customerProduct of restoredCustomerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (customerEntitlement.replaceables.length > 0) {
				updateCustomerEntitlements.push({
					customerEntitlement,
					insertReplaceables: customerEntitlement.replaceables,
				});
			}
		}
	}
	for (const patch of patches) {
		for (const customerEntitlement of patch.deleteCustomerEntitlements) {
			if (customerEntitlement.replaceables.length > 0) {
				updateCustomerEntitlements.push({
					customerEntitlement,
					insertReplaceables: customerEntitlement.replaceables,
				});
			}
		}
	}

	return {
		customerId: autumnBillingPlan.customerId,
		insertCustomerProducts: restoredCustomerProducts.slice().reverse(),
		updateCustomerProducts: compact(
			getUpdateCustomerProducts({ autumnBillingPlan })
				.filter(
					({ customerProduct }) =>
						!insertedCustomerProductIds.has(customerProduct.id),
				)
				.slice()
				.reverse()
				.map(({ customerProduct, updates }) => ({
					customerProduct: applyCustomerProductUpdate({
						customerProduct,
						updates,
					}),
					updates: previousValues({ before: customerProduct, updates }),
				})),
		),
		deleteCustomerProducts: compact(insertedCustomerProducts.slice().reverse()),
		patchCustomerProducts: compact(
			patches
				.slice()
				.reverse()
				.map((patch) => ({
					customerProduct: applyCustomerProductPatch({
						customerProduct: patch.customerProduct,
						patch,
					}),
					insertCustomerEntitlements: patch.deleteCustomerEntitlements,
					insertCustomerPrices: patch.deleteCustomerPrices,
					deleteCustomerEntitlements: patch.insertCustomerEntitlements,
					deleteCustomerPrices: patch.insertCustomerPrices,
				})),
		),
		updateCustomerEntitlements: compact(updateCustomerEntitlements),
	};
};
