import type {
	AutumnBillingPlan,
	CustomerProductUpdateSchema,
	FullCusProduct,
	FullCustomerEntitlement,
	PatchCustomerProductSchema,
} from "@autumn/shared";
import type { z } from "zod/v4";

type CustomerProductUpdate = z.infer<typeof CustomerProductUpdateSchema>;
type PatchCustomerProduct = z.infer<typeof PatchCustomerProductSchema>;

export const makeAutumnBillingPlan = ({
	inserts = [],
	update,
	updates,
	deleteOne,
	deletes,
	patches,
}: {
	inserts?: FullCusProduct[];
	update?: CustomerProductUpdate;
	updates?: CustomerProductUpdate[];
	deleteOne?: FullCusProduct;
	deletes?: FullCusProduct[];
	patches?: PatchCustomerProduct[];
} = {}): AutumnBillingPlan => {
	return {
		customerId: "cus_test",
		insertCustomerProducts: inserts,
		updateCustomerProduct: update,
		updateCustomerProducts: updates,
		deleteCustomerProduct: deleteOne,
		deleteCustomerProducts: deletes,
		patchCustomerProducts: patches,
	} as AutumnBillingPlan;
};

export const makeUpdate = ({
	customerProduct,
	updates,
}: {
	customerProduct: FullCusProduct;
	updates: CustomerProductUpdate["updates"];
}): CustomerProductUpdate => ({ customerProduct, updates });

export const makePatch = ({
	customerProduct,
	insertEntitlements = [],
	deleteEntitlements = [],
}: {
	customerProduct: FullCusProduct;
	insertEntitlements?: FullCustomerEntitlement[];
	deleteEntitlements?: FullCustomerEntitlement[];
}): PatchCustomerProduct =>
	({
		customerProduct,
		insertCustomerEntitlements: insertEntitlements,
		deleteCustomerEntitlements: deleteEntitlements,
		insertCustomerPrices: [],
		deleteCustomerPrices: [],
	}) as PatchCustomerProduct;

export const makeCustomerEntitlement = ({
	featureId,
}: {
	featureId: string;
}): FullCustomerEntitlement =>
	({
		id: `cusEnt_${featureId}`,
		feature_id: featureId,
		internal_feature_id: `internal_${featureId}`,
	}) as unknown as FullCustomerEntitlement;
