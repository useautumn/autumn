import type {
	AutumnBillingPlan,
	CustomerProductUpdateSchema,
	FullCusProduct,
	FullCustomerEntitlement,
	PatchCustomerProductSchema,
} from "@autumn/shared";
import { AllowanceType, EntInterval, FeatureType } from "@autumn/shared";
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
		entitlement: {
			id: `ent_${featureId}`,
			created_at: 1_700_000_000_000,
			internal_feature_id: `internal_${featureId}`,
			internal_product_id: "internal_pro",
			internal_reward_id: null,
			is_custom: false,
			allowance_type: AllowanceType.Fixed,
			allowance: 100,
			interval: EntInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			usage_limit: null,
			expiry_duration: null,
			expiry_length: null,
			rollover: null,
			feature_id: featureId,
			feature: {
				internal_id: `internal_${featureId}`,
				org_id: "org_test",
				created_at: 1_700_000_000_000,
				env: "sandbox",
				id: featureId,
				name: featureId,
				type: FeatureType.Metered,
				config: { usage_type: "single_use" },
				display: null,
				archived: false,
				event_names: [],
			},
		},
		replaceables: [],
		rollovers: [],
	}) as unknown as FullCustomerEntitlement;
